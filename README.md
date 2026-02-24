# Claude Code Skills Viewer

로컬에 설치된 Claude Code 스킬들을 브라우저에서 조회, 추가, 삭제할 수 있는 로컬 서버입니다.

## 설치 & 실행

### npx (설치 없이 바로 실행)

```bash
npx claude-skills-viewer
```

### 글로벌 설치

```bash
npm install -g claude-skills-viewer
claude-skills-viewer
```

### 포트 변경

```bash
# CLI 인자
npx claude-skills-viewer --port 4000

# 환경변수
PORT=4000 npx claude-skills-viewer
```

기본 포트는 `3333`입니다. 브라우저가 자동으로 열립니다.

포트가 이미 사용 중인 경우 자동으로 다음 포트를 시도합니다 (최대 5회).

## 파일 구조

서버는 아래 디렉토리를 사용합니다:

```
~/.claude/skills/              # 설치된 스킬 (심볼릭 링크)
~/.agents/skills/              # 스킬 원본 디렉토리
~/.claude/skills-viewer.json   # 프로젝트 목록 설정 (자동 생성)
<프로젝트>/.claude/skills/     # 프로젝트별 스킬
```

## 기능

### 프로젝트 스킬

- 헤더의 `+ 프로젝트` 버튼으로 프로젝트 관리 다이얼로그 열기
- OS 폴더 선택기로 프로젝트 경로 추가 (macOS/Windows/Linux)
- 등록된 프로젝트의 `.claude/skills/` 스킬을 Personal 스킬과 함께 표시
- 각 스킬 카드에 `Personal` / `Project` 스코프 배지 표시
- 프로젝트 목록은 `~/.claude/skills-viewer.json`에 저장되어 서버 재시작 후에도 유지

### 검색

- 상단 검색바에 키워드 입력
- 스킬 이름, 설명, 태그를 모두 검색
- 키보드 `/` 키로 검색바 포커스

### 즐겨찾기

- 각 스킬 카드의 ☆ 버튼을 클릭하여 즐겨찾기 추가/제거
- 헤더의 ☆ 필터 버튼으로 즐겨찾기한 스킬만 표시
- 검색 필터와 동시 적용 가능
- 즐겨찾기 상태는 브라우저 localStorage에 저장되어 새로고침 후에도 유지

### 스킬 카드

- **클릭**: 카드를 확장하여 SKILL.md 전체 내용 표시 (마크다운 렌더링)
- **다시 클릭**: 카드 접기
- `Esc` 키로 열린 카드 닫기

### 스킬 추가

- 헤더의 `+ 추가` 버튼 클릭
- SKILL.md 파일을 드래그 앤 드롭 또는 클릭하여 업로드
- 파일의 frontmatter에서 이름/설명 자동 파싱
- 스킬 디렉토리 이름 입력 후 `스킬 추가` 클릭

### 스킬 삭제

- 각 카드 하단의 `삭제` 버튼 클릭
- 확인 다이얼로그에서 `삭제` 클릭

### 키보드 단축키

| 키 | 동작 |
|----|------|
| `/` | 검색바 포커스 |
| `Esc` | 다이얼로그 닫기 / 열린 카드 닫기 / 검색바 블러 |

## API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/` | 뷰어 HTML 페이지 |
| `GET` | `/api/skills` | 전체 스킬 목록 (JSON) |
| `PUT` | `/api/skills/:name` | 스킬 추가 (body: SKILL.md 내용) |
| `DELETE` | `/api/skills/:name` | 스킬 삭제 |
| `GET` | `/api/projects` | 등록된 프로젝트 목록 |
| `PUT` | `/api/projects` | 프로젝트 추가 (body: `{ path }`) |
| `DELETE` | `/api/projects` | 프로젝트 제거 (body: `{ path }`) |
| `GET` | `/api/pick-folder` | OS 네이티브 폴더 선택기 |

## 지원 플랫폼

- macOS, Windows, Linux
- Node.js 18+
- 인터넷 연결 (marked.js CDN, 최초 1회)

## 문제 해결

### 스킬이 안 보이는 경우

```bash
ls -la ~/.claude/skills/
```

### 끊어진 심볼릭 링크

```bash
find ~/.claude/skills -type l ! -exec test -e {} \; -print
```

## License

MIT
