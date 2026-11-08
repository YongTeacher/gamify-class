# 생명과학 탐구 연구소 작업 인수인계

최종 갱신: 2026-11-08

## 작업 위치

- 소유 저장소: baesisi3648/gamify-class
- 로컬: D:/gamify_class/apps/life-science-lab
- 운영 주소: https://life-science-lab.bsy0708.workers.dev/
- 프런트 호환 경로: /apps/life-science-lab/
- API: /api/lab/rpc 및 /api/lab/health
- 저장소: 독립된 신규 Google Sheets + 신규 Apps Script
- 생태월드는 구현 패턴만 참고했고 실제 학생 데이터나 기존 시트는 사용하지 않음.

## 이번에 완료한 것

학생·교사 화면, 9단계 효소 보고서, 자동저장과 복구, 명단 파일 등록,
탐구 항목 관리, 검토와 보완·재제출, 전시본 편집·공개·취소를 구현했습니다.

새 스프레드시트:
https://docs.google.com/spreadsheets/d/10YZYoEJhYknsCvi00dLonO2Qoo6p31RHP_59AOk3xyA/edit

필수 데이터 탭 7개와 공개 이력 탭을 만들었고, 효소 탐구와 9개 항목을 넣었습니다.
학생·보고서·검토·전시 탭에는 실제 학생 자료를 넣지 않았습니다.

## 완료한 검증

- JavaScript 문법 검사 통과.
- 권한·저장 순서·중복·제출 잠금·공개 분리·Apps Script 어댑터 테스트 14개 통과.
- Microsoft Edge 브라우저에서 가상 계정으로 전체 작성·복원·제출·보완·재제출·승인·공개·취소 통과.
- CSV / XLSX / XLS 명단 등록, 새 탐구 항목 생성 통과.
- 390px 모바일 화면 가로 넘침 없음. 브라우저 JavaScript 오류 없음.
- 기존 Pages Functions와 함께 Wrangler 빌드 성공.
- 새 Sheets의 탭, 머리글, 효소 탐구 9개 항목 읽기 검증 완료.
- 로컬 화면 캡처는 .qa/ 아래이며 Git에서 제외됩니다.

브라우저 검증은 메모리 데모 저장소를 사용했습니다.
실제 Apps Script 웹 앱까지의 네트워크 저장은 아직 연결하지 않아 검증하지 못했습니다.

## 실제 수업 사용 전에 남은 것

1. 소유자가 Apps Script 편집기에서 setupLifeScienceLab을 처음 실행하여 스프레드시트 접근을 승인.
2. 실제 교사 로그인과 Sheets 왕복 저장을 확인.
3. 실제 학생 명단 등록 및 개별 접속 코드 전달.

자세한 절차와 환경 변수는 README.md에 있습니다.
커밋 0949ee8을 main에 푸시했고 메인 Pages 자동 배포와 독립 Worker 운영 배포를 완료했습니다.
Google 로그인과 Apps Script API 설정이 완료되어, 전용 스크립트 생성·코드 업로드·버전 2 배포까지 했습니다.
운영 Worker에는 LAB_ADMIN_HASH, LAB_SESSION_SECRET, LAB_SHEETS_URL, LAB_SHEETS_SECRET 4개를 설정했습니다.
실제 요청은 Google에서 403 접근 거부가 반환되어 소유자의 최초 스크립트 실행 권한 확인을 기다리고 있습니다.

전용 스크립트 편집기:
https://script.google.com/d/1JT24XJVrDqh9tvvZuBou984bw6uT4gJ57wQDzn_O304MqAGKQE_F79Cg/edit

전용 웹 앱 (버전 2):
https://script.google.com/macros/s/AKfycbwrSvJKu6wSB7FTaJF2UIRevpx7bEQCi30KONHkZw1EtMfRTU0XQp1Qo-KvvAYma1_U/exec
Google 로그인은 clasp를 사용하며 인증 파일은 .qa/clasp-auth.json으로 지정하고 Git에서 제외합니다.
.qa/gas-project/에는 비공개 연결키를 포함한 Bootstrap.gs가 생성되므로 이 폴더를 Git에 추가하지 마세요.
스크립트 공개 접근 설정은 API에서 ANYONE_ANONYMOUS / USER_DEPLOYING으로 확인했습니다.
실제 서버 저장에 성공한 것으로 보고하지 않았습니다.
최초 관리자 비밀번호는 .qa/operator-access.txt에만 보관합니다.

## 로컬 변경 보존 주의

작업 당시 루트 main은 원격과 갈라져 있고 마니또·애니멀 더비·ZEP의 로컬 변경도 있었습니다.
이번 변경만 커밋하거나 푸시할 때 전체를 add/초기화하지 마세요.
최신 원격 상태를 먼저 확인하고, 이번 기능의 파일만 분리하여 반영해야 합니다.

이번 변경 범위:

- apps/life-science-lab/ (신규 앱과 문서·테스트)
- functions/api/lab/[[path]].js
- assets/life-science-lab.svg
- apps/index.html (진입 카드)
- index.html (연구소 진입 링크)
- _headers (새 연구소 경로의 보안 헤더)

학생 파일, 사진, 접속 코드, 비밀 변수는 Git에 넣지 않습니다.
메모리 데모의 가상 계정은 로컬 테스트용이며 운영 인증 우회 기능이 아닙니다.
