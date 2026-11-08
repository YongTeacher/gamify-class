# 생명과학 탐구 연구소

탐구하고, 기록하고, 공유하는 생명과학 지식 아카이브.

## 현재 구현

- Gamify Class 홈과 Apps → 수업에서 /apps/life-science-lab/ 진입.
- 탐구 활동 / 나의 연구실 / 탐구 아카이브 / 교사 관리실.
- 효소 탐구 9개 단계, 참고 자료 여러 건, 진행률, 글자 수, 전체 미리보기.
- 학생별 접속 코드 인증, 임시저장, 재접속 복원, 최종 제출 잠금.
- 1.5초 debounce, 순차 저장, 저장 버전 비교, 3회 재시도, 기기별 복구본.
- 명단 직접 등록 및 CSV/XLS/XLSX 업로드, 이용 중지와 접속 코드 재설정.
- 교사 피드백 / 승인 / 보완 요청 / 반려, 보완 후 재제출.
- 승인과 공개의 분리, HTML 인포그래픽 수정·미리보기·최종 공개·공개 취소.
- 익명 기본값, 원본과 전시본 분리, 이전 공개 버전 보존.
- 분야·학년도·내용 검색, 공개 작품 수, 보고서 JSON 다운로드.
- 새 탐구의 동적 항목 추가·삭제·순서·필수 여부·유형·기간 설정.

실제 학생 데이터는 아직 등록하지 않았습니다. 독립 Cloudflare Worker로 운영 화면을 배포했고,
관리자 해시·세션 비밀키와 전용 Apps Script 버전 2를 연결했습니다.
Google 최초 실행 승인이 완료되어 운영 교사 로그인, 탐구 9개 항목 읽기,
학생·보고서·전시 관리 API가 정상 응답하는 것을 확인했습니다.
학생 명단을 등록한 후 수업을 시작할 수 있습니다.

## 기존 프로젝트를 확인한 결과

- 메인: 빌드 없는 HTML/CSS/JS, apps/index.html의 APPS 목록, Cloudflare Pages Functions.
- 생태월드 본체: 별도 eco-quest/ 저장소. functions/api/eco/[[path]].js의
  명단 검사·학생 PIN·교사 인증·쿠키 세션·소감문 제출 잠금 패턴 참고.
- 생태월드 저장은 D1이 원본이고 Google Apps Script로 Sheets 동기화.
  소감문 UI는 명시적 임시저장 버튼 방식. 새 앱은 자체 debounce와 버전 비교를 추가함.
- 학생 명단 파일 처리는 생태월드의 로컬 SheetJS 패턴 참고.
- 생태월드 코드·DB·사진·학생 명단·스프레드시트는 수정하거나 재사용하지 않음.

## 데이터 흐름과 파일

운영 주소: https://life-science-lab.bsy0708.workers.dev/

브라우저 → /api/lab/rpc (전용 Worker) → 서명된 서버 요청 → 전용 Apps Script → 새 Sheets.
Gamify Class 메인 Pages는 별도 Cloudflare 계정이므로, 전용 Worker와 외부 진입 카드를 사용합니다.
Pages Function 어댑터도 함께 보관하여 필요한 경우 같은 출처 경로로 운영할 수 있습니다.

| 파일 | 역할 |
| --- | --- |
| index.html, styles.css, app.js | 4개 공간과 반응형 UI |
| seed.js | 첫 효소 탐구의 9개 항목 |
| autosave.js | 순차 저장·버전·복구 상태 |
| server/api.js, server/auth.js | 서버 권한·PBKDF2·HttpOnly 쿠키·출처 검사 |
| server/repository.js | 저장소 접근 계층. 향후 DB 교체 시 이 어댑터를 교체 |
| domain.js | 데이터베이스와 독립된 수행평가·공개 규칙 |
| google-apps-script/Code.gs | 시트 초기화·HMAC 검사·LockService·저장 어댑터 |
| google-apps-script/Domain.gs, Seed.gs | 원본 JS에서 생성한 Apps Script 파일 |
| ../../functions/api/lab/[[path]].js | Gamify Class Pages API 라우트 |
| scripts/dev.mjs | 로컬 정적·API 미리보기, 선택적 메모리 데모 |
| test/ | 권한·상태 전이·저장 충돌·브라우저 검증 |

## 1. 전용 Google Sheets와 Apps Script 연결

새로 만든 전용 파일:
https://docs.google.com/spreadsheets/d/10YZYoEJhYknsCvi00dLonO2Qoo6p31RHP_59AOk3xyA/edit

이름: **Gamify Class - 생명과학 탐구 연구소**

1. 위 스프레드시트에서 **확장 프로그램 → Apps Script**를 엽니다.
2. 이 폴더에서 npm run gas를 실행합니다.
3. Apps Script에 아래 3개 파일을 그대로 넣습니다.
   - google-apps-script/Code.gs → Code.gs
   - google-apps-script/Domain.gs → Domain.gs
   - google-apps-script/Seed.gs → Seed.gs
4. setupLifeScienceLab 함수를 실행하고 Google 권한을 승인합니다.
   반복 실행해도 기존 학생·보고서·공개 작품을 지우지 않습니다.
5. 프로젝트 설정 → 스크립트 속성에서 LAB_WEBHOOK_SECRET을 확인합니다.
   비밀키를 채팅·Git·스크린샷으로 공유하지 마세요.
6. **배포 → 새 배포 → 웹 앱**:
   - 실행 사용자: **나**
   - 액세스 사용자: **모든 사용자** (서버에서 HMAC를 검증하므로 URL만으로 데이터 접근 불가)
   - 생성된 /exec URL을 복사합니다.
7. 아래 Cloudflare 설정에 URL과 비밀키를 넣습니다.

필수 시트 7개: Students, Assessments, AssessmentFields, Reports, Reviews, Publications, Settings.
공개 버전 이력용 PublicationVersions도 생성됩니다.
새 파일에는 탭과 첫 효소 탐구를 등록해 두었습니다. 초기화 함수는 바인딩과 비밀키를 설정합니다.

시트 셀은 문자열·숫자·배열 등을 정확하게 복원하고 수식 삽입을 방지하기 위해 JSON으로 기록합니다.
학생 명단과 보고서는 웹 관리실에서 편집하고 데이터 시트를 직접 수정하지 마세요.
스프레드시트 공유는 교사만 허용하세요.

## 2. Cloudflare Pages 비밀 변수

선생님 Cloudflare 계정의 life-science-lab Worker → Settings → Variables and Secrets에
다음을 **암호화된 Secret**으로 설정합니다. 생태월드 Worker와 별개입니다.

| 변수 | 값 |
| --- | --- |
| LAB_SHEETS_URL | 새 Apps Script 웹 앱 /exec URL |
| LAB_SHEETS_SECRET | Apps Script의 LAB_WEBHOOK_SECRET과 같은 값 |
| LAB_SESSION_SECRET | 32바이트 이상 무작위 키. 아래 도구로 생성 가능 |
| LAB_ADMIN_HASH | 아래 도구로 생성한 관리자 암호 해시 |

~~~powershell
cd D:/gamify_class/apps/life-science-lab
npm run password
~~~

콘솔에서 숨김 입력으로 8자 이상의 관리자 비밀번호를 받습니다.
출력된 해시와 세션키를 Cloudflare에 넣고 콘솔을 닫으세요.
관리자 비밀번호 원문은 코드·시트·Git에 저장하지 않습니다.

관리자 해시와 세션키 및 저장소 URL·비밀키를 설정했습니다. 최초 관리자 암호는 이 컴퓨터의
.qa/operator-access.txt에만 보관합니다. 이 폴더는 Git에서 제외됩니다.
설정 생성 코드는 scripts/configure-worker.mjs이며, Worker 공개 파일에는 자격 증명이 포함되지 않습니다.
소유자의 setupLifeScienceLab 실행과 스프레드시트 접근 승인은 완료됐습니다.
CLI 배포는 비공개 Bootstrap.gs에 연결키를 주입하며, 서명 확인 후에만 초기화를 허용합니다.

Worker 재배포는 npm run build 후 Wrangler로 wrangler.jsonc를 지정하여 실행합니다.
빌드 출력에는 화면에 필요한 파일과 글꼴만 포함되며 서버 소스·테스트·설정 파일을 공개하지 않습니다.

연결 확인: 같은 사이트의 /api/lab/health에서 configured: true,
이후 교사 로그인 → 학생 직접 등록 → 학생 로그인 → 작성·제출·검토·전시 순서로 확인하세요.
configured는 환경 변수 존재 여부만 검사하므로 로그인까지 확인해야 실제 연결 검증이 끝납니다.

## 3. 수업 운영

1. 교사 관리실 → 학생 명단: CSV 양식을 다운로드하거나 직접 입력합니다.
   필수 열: 학년도,학년,반,번호,이름,접속코드. 첫 번째 시트를 읽습니다.
   같은 학번과 이름의 재등록은 기존 코드를 보존합니다. 다른 이름으로 덮어쓰지 않습니다.
2. 각 학생에게 본인 접속 코드를 개별 전달합니다. 8자 이상 사용합니다.
3. 탐구 활동 설정에서 학년도·시작일·마감일·공개 상태를 정합니다.
   시간은 입력 기기의 현지 시각으로 선택하고 UTC로 저장, 화면은 한국 시각으로 표시합니다.
4. 학생은 9단계 보고서를 작성합니다. 서버 저장에 실패하면 화면에 실패 상태가 남습니다.
   다른 창과 충돌하면 복구본을 다운로드하고 최신본을 다시 불러옵니다.
5. 교사는 보고서를 승인하거나 피드백과 함께 보완 요청/반려합니다.
6. 승인 후 **전시본 만들기** → 전시 수정본 저장 → 미리보기 → 개인정보·동의 확인 → **최종 공개**.
   학생 원문의 개인정보나 과학적 오류는 교사가 직접 확인합니다. 과학 내용을 자동으로 만들어 넣지 않습니다.
7. 전시 관리에서 언제든 공개를 취소할 수 있습니다. 편집 중인 수정본은 기존 공개본에 영향을 주지 않습니다.
8. 학년도마다 새 탐구/학생 명단을 등록합니다. 보고서 다운로드로 보관할 수 있습니다.
   삭제 자동화는 없으며 학교의 보존 기한에 따른 삭제는 별도 운영 절차로 수행합니다.

기존 보고서의 항목은 작성 시작 시의 스냅샷을 유지합니다.
탐구 항목 수정은 새로 시작하는 보고서부터 적용되므로 이미 작성한 글이 유실되지 않습니다.

## 검증 / 로컬 실행

~~~powershell
npm ci
npm run check
npm test
npm run gas
npm run dev -- --demo
~~~

주소: http://localhost:8791/apps/life-science-lab/

데모는 **명시적인 --demo 실행에서만** 메모리 저장소를 사용합니다.
운영 API에는 데모 우회 기능이 없습니다. 서버 종료 시 데모 기록이 없어집니다.

- 가상 학생: 2026학년도 / 2학년 / 1반 / 1번 / 가상연구자1 / student-demo-2026
- 가상 교사 암호: teacher-demo-2026

별도 터미널에서 npm run test:browser를 실행하면 설치된 Microsoft Edge를 사용합니다.
캡처는 Git에서 제외되는 .qa/에 저장됩니다.

실제 Apps Script를 테스트하려면 --demo 없이 환경 변수를 설정하여 실행하거나
Gamify Class 루트에서 Wrangler Pages 개발 서버를 사용하세요.

## 저장 및 운영 한계

- Apps Script의 ScriptLock으로 동시에 수행되는 읽기·저장을 직렬화하고 보고서 버전을 비교합니다.
  보고서 한 건은 한 행 쓰기로 저장합니다. 여러 시트 전체에 대한 DB 수준 트랜잭션은 아닙니다.
- 저장 실패·응답 시간 초과 후에는 성공으로 표시하지 않습니다. 응답이 유실돼 저장 여부가 모호하면
  최신본을 불러와 비교하도록 안내합니다.
- Sheets/Apps Script의 사용량·실행 시간 제한이 있어 대규모 동시 수업 전에는 실제 반 규모로 부하 확인이 필요합니다.
- 로컬 복구본은 학생 ID와 보고서 ID로 분리합니다. 7일 넘은 복구본은 자동 복원하지 않습니다.
  공용 기기에서는 로그아웃하고 브라우저 사이트 데이터를 지우세요.
- 서명 쿠키는 8시간 만료입니다. 학생 이용 중지/접속 코드 재설정은 기존 세션도 무효화합니다.
- 실제 운영 인증 과정의 Sheets 쓰기 및 관리 API의 Sheets 읽기를 확인했습니다.
  보고서 전체 과정은 가상 계정·메모리 저장소로 브라우저 검증했습니다.

## 디자인

2026-11-08: 네이비·화이트·쿨그레이 기반 연구기관 스타일로 개편했습니다.
연구 도식, DNA 심볼, 프로그램 카드, 연구 노트·관리실·아카이브에 같은 시각 체계를 적용합니다.
