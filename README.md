# Lyrics Slot Viewer

가사를 슬롯 단위로 관리하고 화면에 표시하는 웹 애플리케이션입니다. 회원가입이나 별도 서버 없이 브라우저에서 사용합니다.

## 주요 기능

- 슬롯 생성·선택·이름 변경·개별 삭제 및 확인 후 전체 삭제
- TXT 업로드와 여러 TXT 파일의 드래그 앤 드롭
- 슬롯 드래그 정렬, 좌우 방향키로 이전·다음 슬롯 선택
- 읽기·수정 모드 전환, 가사 직접 입력·편집
- 글꼴(Sans/Serif/Mono), 크기, 정렬, 굵기, 글자·배경 색상, 여백, 자간·행간 설정
- 배경 단색·그라데이션 전환, 프리셋 6종, 시작·끝 색상과 방향 직접 설정
- 사이드바 접기·펼치기, 사용 설명서
- 가사·슬롯 순서·선택 상태·뷰어 설정 자동 저장

## 실행 방법

Node.js 22와 npm을 사용합니다. 저장소 폴더에서 실행하세요.

```sh
npm ci
npm run dev
```

개발 서버: http://localhost:3000/

```sh
npm run lint
npm run build
npm run preview
```

lint는 TypeScript 오류 검사(tsc --noEmit)입니다. 빌드 결과는 dist에 생성됩니다.
미리보기: http://localhost:4173/lyricstoolforHSH/

## 웹사이트 접속

[Lyrics Slot Viewer](https://dobaisnotdobi.github.io/lyricstoolforHSH/)

최초 접속은 아래 Pages 설정과 배포가 완료된 후 가능합니다.

## 사용 방법

1. 왼쪽 **+** 버튼으로 슬롯을 만들고 목록에서 선택합니다. 슬롯에 마우스를 올리면 이름 수정·삭제 버튼이 나타납니다.
2. **TXT 업로드**로 UTF-8 가사를 불러옵니다. 선택된 슬롯이 있으면 해당 슬롯에 입력하고 기존 내용이 있으면 덮어쓰기를 확인합니다. 선택된 슬롯이 없으면 새 슬롯을 만듭니다.
3. 여러 TXT 파일을 왼쪽 목록에 드롭하면 파일명으로 각각 새 슬롯이 생성됩니다.
4. 슬롯 왼쪽 손잡이를 드래그하여 순서를 바꿉니다. 입력 중이 아닐 때 **← / →** 키로 슬롯을 이동합니다.
5. 상단 모드 버튼으로 읽기·수정 모드를 전환하고 수정 모드에서 가사를 편집합니다.
6. **뷰어 설정**에서 표시 방식을 조절합니다. 가운데 정렬에서는 여백 조절이 비활성화됩니다.
7. **배경 색상 → 그라데이션**에서 라벤더·하늘·민트·노을·레몬·새벽 프리셋을 선택합니다. **직접 설정**에서 시작·끝 색상과 방향(0~360°)을 조절하거나 색상 순서를 바꿀 수 있습니다. 단색으로 전환하면 이전 단색 배경이 복원되며 그라데이션 설정도 보관됩니다.

## 데이터 저장

브라우저 localStorage에 다음 키로 자동 저장합니다.

| 키 | 저장 내용 |
| --- | --- |
| lyrics-slots | 슬롯 ID, 이름, 가사, 순서, 생성·수정 시각 |
| lyrics-selected-slot-id | 선택한 슬롯 ID |
| lyrics-settings | 글꼴, 색상, 정렬 등 뷰어 설정 |
| lyrics-edit-mode | 읽기·수정 모드 |
| lyrics-sidebar-open | 사이드바 열림 상태 |

같은 브라우저 프로필과 같은 출처(프로토콜·호스트·포트)에서는 새로고침·재접속 후에도 유지됩니다. 사이트 업데이트는 저장 데이터를 초기화하지 않습니다. 저장소는 경로별로 분리되지 않으므로 같은 출처에서 동일 키를 쓰는 다른 앱과 충돌할 수 있습니다.

localhost, 기존 호스팅 주소, GitHub Pages는 출처가 달라 데이터가 자동 이전되지 않습니다. 기존 주소의 데이터는 그대로 남습니다. 다른 기기·브라우저와 동기화되지 않으며 사이트 데이터 삭제·비공개 모드 종료 등에 따라 사라질 수 있습니다. 서버 백업이나 내보내기 기능은 없으므로 원본 TXT를 따로 보관하세요. 업로드한 가사는 서버로 전송하지 않습니다.

## 기술 스택

- React 19, TypeScript, Vite 6
- Tailwind CSS 4, clsx, tailwind-merge
- dnd-kit(정렬), Motion(애니메이션), Lucide React(아이콘)
- 브라우저 FileReader/File API, localStorage
- GitHub Actions, GitHub Pages

기존 Google Fonts 연결을 사용하므로 웹폰트 로딩에는 인터넷 연결이 필요합니다.

## 환경변수와 보안

현재 앱에는 GEMINI_API_KEY나 다른 API 키가 필요하지 않습니다. Vite 설정에서 Gemini 키를 브라우저 코드에 주입하지 않습니다. .env, .env.*, 로컬 설정과 일반적인 인증 파일은 .gitignore로 제외합니다. 브라우저에 노출되는 VITE_* 변수에는 비밀값을 넣지 마세요.

기존 패키지의 @google/genai, dotenv, express, better-sqlite3, @types/express는 현재 앱 코드에서 사용하지 않습니다. 이번 배포 설정에서는 의존성과 잠금 파일을 유지했습니다. 실행에 필요한 서버 전용 기능은 없으며 정적 호스팅으로 동작합니다.

## 배포 및 업데이트

1. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정합니다.
2. 저장소에서 Actions 실행을 허용합니다. github-pages 환경에 승인 규칙이 있으면 배포 시 승인합니다.
3. 변경 사항을 main에 push하면 .github/workflows/deploy.yml이 자동 실행됩니다.
4. Node.js 22에서 package-lock.json에 맞춰 npm ci로 설치하고 TypeScript 검사와 npm run build를 실행합니다. 공식 Pages Actions로 dist를 업로드·배포합니다.
5. **Actions → Deploy to GitHub Pages**에서 결과를 확인합니다. 실패한 단계의 로그에 설치·타입 검사·빌드 오류가 표시됩니다.

**Run workflow**에서 main을 선택해 수동 실행할 수도 있습니다. 다른 브랜치의 수동 실행은 배포하지 않습니다. 별도의 API 키나 사용자 토큰 Secret은 필요하지 않습니다.

프로덕션 base path는 /lyricstoolforHSH/이며 개발 서버는 기존 / 경로를 사용합니다. PR 생성만으로 배포되지 않으며 main에 병합하면 자동 배포가 시작됩니다.
