# AIFred 개발 일지

작업 하나가 `developer → reviewer → logger` 순서를 거쳐 커밋될 때마다 logger가 항목을 추가한다. 최신 항목이 위에 온다.

## 항목 템플릿

```markdown
### YYYY-MM-DD · <작업 제목>
- **커밋**: <해시 또는 "다음 기록 때 채움">
- **범위**: server | web | docs | infra
- **내용**: 무엇을 왜 바꿨는지 1~3줄
- **변경 파일**: `path/a`, `path/b`
- **검증**: 테스트 명령과 결과 (예: pytest 12 passed)
- **리뷰**: APPROVE (지적 후 수정한 사항이 있으면 한 줄로)
- **남은 이슈**: 없음 | 내용
```

## 기록

### 2026-10-12 · 개발 프로세스 설정
- **커밋**: 최초 커밋 (다음 기록 때 해시 채움)
- **범위**: infra
- **내용**: developer / reviewer / logger 서브에이전트를 정의하고 개발 일지와 PRD 사본(`docs/PRD.md`)을 만들었다. 개발 환경(Python 3.12.10, Node.js 24.20.0, Git 2.55.0)을 설치하고 git 저장소를 초기화했다.
- **변경 파일**: `.claude/agents/developer.md`, `.claude/agents/reviewer.md`, `.claude/agents/logger.md`, `docs/DEVLOG.md`, `docs/PRD.md`, `.gitignore`
- **검증**: 해당 없음 (코드 없음)
- **리뷰**: 해당 없음 (프로세스 설정 커밋이라 reviewer/logger를 거치지 않고 직접 커밋)
- **남은 이슈**: 없음
