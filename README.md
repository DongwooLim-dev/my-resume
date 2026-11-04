# base-resume

HTML · CSS만으로 만든 이력서 웹페이지 템플릿입니다.
`index.html`의 **글자만** 바꾸면 나만의 이력서 사이트가 완성됩니다.

## 파일 구성

| 파일 | 역할 |
| --- | --- |
| `index.html` | 이력서 본문 (✏️ 이 파일만 수정) |
| `style.css` | 디자인 (수정하지 않아도 됨) |
| `profile.svg` | 프로필 이미지 (내 사진으로 교체 가능) |
| `.github/workflows/ci.yml` | push 할 때 HTML 문법 자동 검사 |
| `.htmlvalidate.json` | HTML 검사 규칙 설정 |

## 수정 · 배포 6단계

1. **index.html 수정** — `<!-- 여기를 내 내용으로 수정 -->` 주석 바로 아래 줄의 글자만 바꿉니다. 태그(`<h3>`, `</li>` 등)는 지우지 마세요.
2. **더블클릭으로 확인** — `index.html`을 더블클릭해 브라우저에서 화면을 확인합니다.
3. **커밋** — `git add .` → `git commit -m "이력서 내용 수정"`
4. **push** — `git push`
5. **Actions 확인** — GitHub 저장소의 **Actions** 탭에서 "HTML 검사"가 초록색 ✅ 인지 확인합니다.
6. **Vercel 배포** — [vercel.com](https://vercel.com) 에서 **Add New → Project → 내 저장소 Import → Deploy** 를 누릅니다. (설정 변경 없이 그대로 배포)

> 💡 **CI가 빨간색 ❌ 이면:** Actions 로그의 **첫 번째 error** 줄에서 `46:12` 처럼 표시된 앞 숫자가 **줄 번호**(46번째 줄)이니, 에디터에서 그 줄의 빠진 태그를 확인합니다.

## 프로필 사진 바꾸기

사진 파일(예: `me.jpg`)을 이 폴더에 넣고, `index.html`의 `src="profile.svg"`를 `src="me.jpg"`로 바꿉니다.

## 주의

전화번호 · 주소 · 생년월일 · 이메일 같은 개인정보는 공개 사이트에 올리지 마세요.

---

## Azure Python 데일리 플래너와 사이드바

위 내용은 기존 정적 이력서 템플릿 안내입니다. 현재 사이트에는 별도 기능이 추가되었습니다.

- `index.html`: 기존 이력서와 접이식 사이드바 연결
- `sidebar.css`, `sidebar.js`: 사이드바 전용 스타일 및 열기·닫기 동작
- `planner/`: FastAPI 앱, 플래너 화면, 의존성 및 배포 설정
- [플래너 실행·배포 안내](planner/README.md)

메인페이지의 **메뉴 → 데일리 플래너**에서 `/planner/`로 이동합니다.
플래너는 공개 조회·SSH 터널 편집 방식입니다. 조회 시 기존 일정과 보관함도 공개됩니다.
공개 접속의 변경 요청은 Nginx와 Python 앱 양쪽에서 차단합니다.

**주의:** 기존 Vercel 정적 배포 방식만으로 Python 앱은 실행되지 않습니다.
`/planner/`를 제공하려면 Python 서버와 Nginx 연결 설정이 필요합니다.
Git 변경을 저장하는 것과 Azure 서버에 배포하는 것은 별도 작업입니다.

실제 일정 DB·SSH 개인 키·가상환경·로그·백업은 저장소에 넣지 않습니다.
