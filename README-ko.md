# omo-codex-computer

[English](README.md)

OpenAI Codex의 네이티브 Computer Use로 로컬 macOS 앱을 살펴보고 조작합니다.

`omo-codex-computer`는 OMO Native 플러그인입니다. 다른 모델 제공자, 브라우저, raw JavaScript, CDP는 지원하지 않습니다.

## 빠른 시작

1. 이 저장소를 설치합니다.

   ```bash
   omo install git:github.com/floweredao/omo-codex-computer
   ```

2. OMO를 다시 시작하면 `tool_search`로 도구를 찾을 수 있습니다. 현재 세션에서 도구 묶음을 켜려면 `/codex-computer enable`을 실행하세요. 준비 상태 확인, 진단, 문제 해결은 아래 명령어와 문제 해결 섹션에 있습니다.

## Computer Use

플러그인은 `computer_use_*` 도구 12개를 등록합니다.

| 권한 | 도구 |
| --- | --- |
| 읽기 전용 | `computer_use_list_apps`, `computer_use_get_app_state`, `computer_use_resolve_app` |
| 쓰기 가능 | `computer_use_click`, `computer_use_type_text`, `computer_use_press_key`, `computer_use_scroll`, `computer_use_drag`, `computer_use_set_value`, `computer_use_select_text`, `computer_use_perform_secondary_action`, `computer_use_paste` |

`computer_use_list_apps`, `computer_use_resolve_app`, `computer_use_get_app_state` 중 하나로 시작하세요. 화면 좌표보다 요소 인덱스를 우선 사용하고, 변경할 때마다 상태를 다시 확인하세요.

텍스트 입력 동작:

- `computer_use_type_text`는 실제 키 이벤트를 보내며 ASCII 텍스트를 지원합니다. 줄바꿈은 Return 키 입력으로 처리되므로 많은 앱에서 폼 제출이나 메시지 전송이 일어납니다.
- 한국어, 일본어, 중국어, 이모지처럼 ASCII가 아닌 문자가 들어간 텍스트는 클립보드 기반 `paste` 경로로 자동 전환되고, `element_index`를 지정하면 해당 텍스트 필드에 직접 값을 넣습니다. 키 입력 방식으로는 IME 문자를 만들 수 없기 때문입니다.
- `computer_use_paste`는 일반 텍스트, Markdown, HTML을 붙여 넣은 뒤 원래 클립보드를 복원합니다. 길거나 서식이 있는 내용에 적합합니다.
- `computer_use_press_key`는 `Return`, `BackSpace`, `Delete`, `Tab`, `super+c`, `KP_0` 같은 xdotool 형식 키 이름을 씁니다.
- `computer_use_scroll`은 `element_index`로 요소를, `x`/`y` 좌표로 지점을 지정합니다.

예시:

```text
Computer Use로 캘린더 앱을 살펴봐. 보이는 캘린더 이름을 나열하되 아무것도 바꾸지 마.
```

## 안전 모델

### 확인과 권한

- 모든 도구는 interactive, print, RPC 세션에서 OMO 권한 프리셋과 명시적 규칙에 권한 판단을 맡깁니다. 플러그인이 별도 확인 창을 추가하지 않습니다.
- 함께 배포되는 `codex-computer` 스킬에 Computer Use 확인 정책이 들어 있습니다. 사용자에게 넘겨야 하는 작업(비밀번호 변경, 보안 장치 우회), 항상 확인이 필요한 작업(삭제, 제3자와의 소통, 금융 거래, 시스템 설정), 사전 승인 가능한 작업(로그인, 업로드, 파일 이동), 확인이 필요 없는 작업(다운로드, 읽기 전용 조회)으로 나뉩니다.
- 네이티브 Computer Use 권한 요청(elicitation)은 interactive UI가 없으면 거부됩니다. 개발 전용 앱 허용 목록만 예외입니다.
- 데스크톱 상태는 신뢰할 수 없는 콘텐츠로 취급합니다.

### 실패 경계

네이티브 Computer Use는 `node_repl`을 거치는 Codex Sky 경로를 우선 사용합니다. 직접 Computer Use MCP 경로는 동작이 전송되기 전에만 선택할 수 있으며, 부작용이 생겼을 수 있는 동작은 다시 실행하지 않습니다.

업스트림 `paste`는 텍스트가 이미 붙여 넣어졌는데도 클립보드 읽기 시간 초과를 보고할 수 있습니다. 이때 플러그인은 앱 상태를 다시 읽어 붙여 넣은 텍스트가 보이면 성공으로 보고하고, 보이지 않으면 원래 오류를 그대로 전달합니다.

## 요구 사항

| 기능 | 필요한 설정 |
| --- | --- |
| 공통 | macOS, OMO Native, Node.js 24 이상, `PATH`에서 `codex`로 실행되는 Codex CLI |
| 네이티브 Computer Use | Codex Computer Use를 쓸 수 있는 Codex.app 또는 ChatGPT.app, 번들된 `computer-use` Codex 플러그인, 요청 시 손쉬운 사용 및 화면 기록 권한 |

## 명령어

| 명령어 | 동작 |
| --- | --- |
| `/codex-computer status` | Computer Use 준비 상태를 보고합니다. |
| `/codex-computer diagnose` | `status`와 같은 상세 준비 상태 보고서를 출력합니다. |
| `/codex-computer enable` | Computer Use 도구를 켭니다. |
| `/codex-computer disable` | 도구를 끄고 런타임을 중지합니다. |
| `/codex-computer restart` | 전용 app-server 런타임을 다시 시작합니다. |

## 설정

| 환경 변수 | 효과 |
| --- | --- |
| `OMO_CODEX_COMPUTER_IDLE_TIMEOUT_MS=<밀리초>` | 유휴 상태 자식 프로세스 종료 시간을 설정합니다. |
| `OMO_CODEX_COMPUTER_DEBUG=1` | 민감 정보를 가린 진단 로그를 stderr에 씁니다. |
| `OMO_CODEX_COMPUTER_LOG=<경로>` | 민감 정보를 가린 진단 로그를 파일에 이어 씁니다. |
| `OMO_CODEX_COMPUTER_DEV_AUTO_ACCEPT_APPS=<앱 목록>` | 개발 전용 네이티브 권한 허용 목록을 설정합니다. |

## 문제 해결

| 문제 | 해결 방법 |
| --- | --- |
| `codex`를 찾을 수 없음 | Codex를 설치하고 `codex`가 `PATH`에 있는지 확인한 뒤 `/codex-computer status`를 실행하세요. |
| Computer Use가 준비되지 않음 | `/codex-computer status`로 app-server, 번들 플러그인, 선택된 경로를 확인하세요. macOS 권한 요청이 뜨면 허용하세요. |
| 실행 중인 로컬 앱이 `Invalid app`으로 나옴 | `computer_use_list_apps` 다음 `computer_use_resolve_app`을 호출하세요. 번들 ID, `.app` 경로, 정확한 등록 표시 이름을 우선 사용하세요. |
| interactive 모드가 아닐 때 쓰기가 막힘 | 적절한 OMO 권한 프리셋과 명시적 규칙을 선택하세요. UI가 없으면 네이티브 권한 요청은 여전히 거부됩니다. |

플러그인 제거:

```bash
omo remove git:github.com/floweredao/omo-codex-computer
```

## 개발

의존성을 설치하고 로컬 검증을 모두 실행합니다.

```bash
bun install --frozen-lockfile
bun run check
bun run qa:host
npm pack --dry-run
```

실제 호스트에서 작업 트리를 불러옵니다.

```bash
omo -e .
```

실제 네이티브 스모크 테스트:

```bash
omo --offline --no-session --no-context-files --no-skills \
  -e . \
  --tools computer_use_list_apps \
  --model openai-codex/gpt-5.6-sol \
  -p 'Call computer_use_list_apps exactly once and report the first returned application name.'
```

기여 절차와 자동화 불변 조건은 [Contributing](CONTRIBUTING.md)을 참고하세요.

## 릴리스와 프로젝트 링크

현재 자동 워크플로 트리거는 꺼져 있습니다. 다시 켜기 전까지 CI와 릴리스는 `workflow_dispatch`로 실행합니다. 릴리스 노트는 릴리스마다 생성됩니다.

- [릴리스 노트](https://github.com/floweredao/omo-codex-computer/releases)
- [Contributing](CONTRIBUTING.md)
- [보안 정책](SECURITY.md)
- [이슈 제보](https://github.com/floweredao/omo-codex-computer/issues)

## 라이선스

[MIT](LICENSE)
