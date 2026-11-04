# Daily Planner — FastAPI + SQLite

공개 조회·SSH 터널 편집 데일리 플래너입니다. 메인페이지 사이드바에서 접근합니다.

## 코드 구성

| 경로 | 역할 |
| --- | --- |
| `app.py` | FastAPI API, SQLite 저장, 접근 검사 |
| `static/` | 플래너 HTML·CSS·JavaScript |
| `requirements.txt` | 주요 의존성 버전 |
| `requirements.lock.txt` | 현재 서버의 전체 의존성 버전 |
| `deploy/daily-planner.service` | 현재 Azure 서버의 systemd 서비스 예시 |
| `deploy/nginx-planner.conf` | 현재 서버의 공개 조회·로컬 편집 연결 설정 |
| `tests/test_access.py` | 데이터 변경 없는 접근 검사·입력 검증 테스트 |

## 로컬 개발

이 폴더에서 가상환경을 새로 만들고 의존성을 설치합니다.
Ubuntu에서 venv 생성이 안 되면 Python venv 지원 패키지가 필요합니다.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.lock.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8765 --no-proxy-headers
```

`http://127.0.0.1:8765/planner/`에서 확인합니다. 최초 실행 시 `data/planner.sqlite3`를 만듭니다.
실제 DB는 Git에서 제외됩니다. 테스트는 `python -m unittest discover -s tests`로 실행합니다.

## 현재 Azure 서비스

- 공개 조회: `http://20.41.105.49/planner/`
- 메인 홈페이지: `/var/www/html`
- 실행 앱: `/home/azureuser/daily-planner`
- DB: `/home/azureuser/daily-planner/data/planner.sqlite3`
- 서비스: `daily-planner.service`
- Nginx 조각: `/etc/nginx/snippets/daily-planner.conf`

편집 시 Windows PowerShell에서 다음 터널을 연결하고 창을 열어 둡니다.
기존 로컬 SSH 설정에 Azure 접속 계정·키 경로가 있어야 합니다. 개인 키는 저장소에 넣지 마세요.

```powershell
ssh -N -L 127.0.0.1:18080:127.0.0.1:80 -o ExitOnForwardFailure=yes 20.41.105.49
```

브라우저에서 `http://127.0.0.1:18080/planner/`를 엽니다.
편집 결과는 공개 페이지에도 표시됩니다. 민감한 일정을 저장하지 마세요.

## 배포 시 주의

저장소 코드를 수정해도 실행 앱과 메인 홈페이지는 자동 변경되지 않습니다.
백업 및 기존 변경 여부를 확인한 뒤 해당 실행 경로에 코드를 반영하고,
Python 앱을 재시작해야 합니다. 기존 데이터 디렉터리는 보존하세요.

제공한 서비스·Nginx 파일은 현재 서버 경로에 맞춘 예시입니다.
서비스는 Python 가상환경과 `data/` 디렉터리가 준비되어 있어야 실행됩니다.
Nginx의 현재 사이트 `server` 블록에서 다음 한 줄로 설정 조각을 연결합니다.

```nginx
include /etc/nginx/snippets/daily-planner.conf;
```

Nginx 설정 변경 후 `sudo nginx -t`로 확인하고 reload합니다.
공개 읽기/쓰기 제한과 `X-Planner-Client $remote_addr` 덮어쓰기 설정은 함께 유지하세요.
API는 loopback 연결, 실제 전달 IP, 로컬 Host와 동일 Origin을 검사합니다.
외부에 8765 포트를 열지 마세요. 로그인은 없으며 SSH 계정 보안이 편집 권한의 전제입니다.
공개 IP나 도메인이 달라지면 `app.py`의 허용 Host 목록도 검토해야 합니다.

SQLite 저장은 디스크 장애에 대한 백업이 아닙니다. WAL 사용 중 단순 파일 복사 대신
SQLite backup API 등 일관성 있는 방식으로 별도 백업을 구성하세요.

## API

- `GET /planner/api/health`
- `GET /planner/api/config`
- `GET /planner/api/tasks?day=YYYY-MM-DD`
- `POST /planner/api/tasks` (로컬 편집만)
- `PUT /planner/api/tasks/{id}` (로컬 편집만)

영구 삭제 기능은 없으며 보관·복원을 사용합니다. 동시 수정은 version 값으로 충돌을 감지합니다.
