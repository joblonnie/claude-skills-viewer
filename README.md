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

## 파일 구조

서버는 아래 디렉토리를 사용합니다:

```
~/.claude/skills/           # 설치된 스킬 (심볼릭 링크)
~/.agents/skills/           # 스킬 원본 디렉토리
```

## 기능

### 검색

- 상단 검색바에 키워드 입력
- 스킬 이름, 설명, 태그를 모두 검색
- 키보드 `/` 키로 검색바 포커스

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

## 요구사항

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
