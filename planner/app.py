"""Public read-only daily planner; editing requires a local SSH tunnel."""
import ipaddress
import os
import sqlite3
from contextlib import asynccontextmanager, contextmanager
from datetime import date, datetime, time, timezone
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from starlette.middleware.trustedhost import TrustedHostMiddleware

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get('PLANNER_DB', str(ROOT / 'data' / 'planner.sqlite3')))


@contextmanager
def database():
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    try:
        with connection:
            yield connection
    finally:
        connection.close()


@asynccontextmanager
async def lifespan(app):
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with database() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('''CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            task_date TEXT NOT NULL,
            start_time TEXT,
            end_time TEXT,
            priority TEXT NOT NULL DEFAULT 'normal',
            done INTEGER NOT NULL DEFAULT 0,
            archived INTEGER NOT NULL DEFAULT 0,
            version INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )''')
        db.execute('CREATE INDEX IF NOT EXISTS tasks_by_date ON tasks(task_date, archived)')
    yield


app = FastAPI(title='Daily Planner', lifespan=lifespan, docs_url=None, redoc_url=None,
              openapi_url=None)
app.add_middleware(TrustedHostMiddleware,
                  allowed_hosts=['localhost', '127.0.0.1', '[::1]', '20.41.105.49'])


def can_edit(request: Request):
    """Nginx overwrites X-Planner-Client; never trust a public client's Host alone."""
    try:
        peer_is_local = ipaddress.ip_address(request.client.host).is_loopback
        source = request.headers.get('x-planner-client', request.client.host)
        source_is_local = ipaddress.ip_address(source).is_loopback
    except (ValueError, AttributeError):
        return False
    return (peer_is_local and source_is_local
            and request.url.hostname in {'localhost', '127.0.0.1', '::1'})


@app.middleware('http')
async def private_browser_guard(request: Request, call_next):
    if request.method not in {'GET', 'HEAD', 'OPTIONS'}:
        if not can_edit(request):
            return JSONResponse({'detail': '공개 페이지는 조회 전용입니다. SSH 터널에서 편집해 주세요.'}, status_code=403)
        origin = request.headers.get('origin', '')
        parsed = urlsplit(origin)
        if (parsed.scheme != 'http' or parsed.netloc != request.headers.get('host')
                or parsed.hostname not in {'localhost', '127.0.0.1', '::1'}
                or request.headers.get('sec-fetch-site') == 'cross-site'):
            return JSONResponse({'detail': 'Same-origin local access required.'}, status_code=403)
        if request.headers.get('content-type', '').split(';')[0] != 'application/json':
            return JSONResponse({'detail': 'JSON content type required.'}, status_code=415)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; script-src 'self'; style-src 'self'; "
        "img-src 'self'; connect-src 'self'; frame-ancestors 'none'; "
        "base-uri 'none'; form-action 'self'"
    )
    return response


class TaskInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(min_length=1, max_length=200)
    task_date: date
    start_time: str | None = None
    end_time: str | None = None
    priority: str = Field(default='normal', pattern='^(normal|high|low)$')

    @field_validator('title')
    @classmethod
    def clean_title(cls, value):
        value = value.strip()
        if not value:
            raise ValueError('할 일을 입력해 주세요.')
        return value

    @field_validator('start_time', 'end_time')
    @classmethod
    def validate_time(cls, value):
        if value is None or value == '':
            return None
        if len(value) != 5 or value[2] != ':':
            raise ValueError('시간은 HH:MM 형식이어야 합니다.')
        time.fromisoformat(value)
        return value

    @model_validator(mode='after')
    def validate_range(self):
        if self.end_time and not self.start_time:
            raise ValueError('종료 시간 입력 시 시작 시간도 필요합니다.')
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError('종료 시간은 시작 시간보다 늦어야 합니다.')
        return self


class TaskUpdate(TaskInput):
    done: bool
    archived: bool
    version: int = Field(ge=1)


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def task_dict(row):
    result = dict(row)
    result['done'] = bool(result['done'])
    result['archived'] = bool(result['archived'])
    return result


@app.get('/planner', include_in_schema=False)
@app.get('/planner/', include_in_schema=False)
def index():
    return FileResponse(ROOT / 'static' / 'index.html')


@app.get('/planner/api/health')
def health():
    with database() as db:
        db.execute('SELECT 1').fetchone()
    return {'status': 'ok'}


@app.get('/planner/api/config')
def config(request: Request):
    return {'can_edit': can_edit(request), 'public_read_only': True}


@app.get('/planner/api/tasks')
def list_tasks(day: date, include_archived: bool = False):
    with database() as db:
        rows = db.execute('''SELECT * FROM tasks WHERE task_date = ?
            AND (? OR archived = 0)
            ORDER BY archived, done, start_time IS NULL, start_time, id''',
            (day.isoformat(), int(include_archived))).fetchall()
    return [task_dict(row) for row in rows]


@app.post('/planner/api/tasks', status_code=201)
def create_task(task: TaskInput):
    now = timestamp()
    with database() as db:
        cursor = db.execute('''INSERT INTO tasks
            (title, task_date, start_time, end_time, priority, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (task.title, task.task_date.isoformat(), task.start_time,
             task.end_time, task.priority, now, now))
        row = db.execute('SELECT * FROM tasks WHERE id = ?', (cursor.lastrowid,)).fetchone()
    return task_dict(row)


@app.put('/planner/api/tasks/{task_id}')
def update_task(task_id: int, task: TaskUpdate):
    with database() as db:
        cursor = db.execute('''UPDATE tasks SET title = ?, task_date = ?,
            start_time = ?, end_time = ?, priority = ?, done = ?, archived = ?,
            version = version + 1, updated_at = ? WHERE id = ? AND version = ?''',
            (task.title, task.task_date.isoformat(), task.start_time, task.end_time,
             task.priority, int(task.done), int(task.archived), timestamp(), task_id, task.version))
        if cursor.rowcount != 1:
            if db.execute('SELECT id FROM tasks WHERE id = ?', (task_id,)).fetchone() is None:
                raise HTTPException(404, '할 일을 찾을 수 없습니다.')
            raise HTTPException(409, '다른 창에서 변경됐습니다. 새로고침 후 다시 시도해 주세요.')
        row = db.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()
    return task_dict(row)


app.mount('/planner/static', StaticFiles(directory=ROOT / 'static'), name='static')
