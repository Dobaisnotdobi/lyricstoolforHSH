import { useEffect, useRef, useState } from 'react';
import { Bookmark, GripVertical } from 'lucide-react';
import { makeBugsBookmarklet } from './bugsBookmarklet';

export default function BookmarkSetup() {
  const anchor = useRef<HTMLAnchorElement>(null);
  const [hint, setHint] = useState(false);
  useEffect(() => {
    // This trusted URL is generated exclusively from the bundled, self-contained sender.
    anchor.current?.setAttribute('href', makeBugsBookmarklet());
  }, []);
  return (
    <main className="mx-auto max-w-xl px-5 py-12 text-slate-800">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-indigo-700">Lyrics Slot Viewer · PC Chrome</p>
        <h1 className="mt-2 text-2xl font-bold">벅스 앨범을 북마크로 가져오기</h1>
        <p className="mt-4 text-sm">아래 보라색 버튼을 Chrome 북마크바로 <strong>한 번 끌어다 놓으세요.</strong></p>
        <a ref={anchor} draggable onClick={event => { event.preventDefault(); setHint(true); }}
          className="my-4 inline-flex cursor-grab items-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white active:cursor-grabbing"
          title="벅스 → 가사 뷰어"><GripVertical aria-hidden="true" size={16}/><Bookmark aria-hidden="true" size={17}/>
          벅스 → 가사 뷰어
        </a>
        <p role="status" className="text-xs text-slate-600">{hint ? '버튼을 마우스로 누른 채 주소창 아래 북마크바에 놓으세요. ' : ''}북마크바가 숨겨져 있으면 Ctrl+Shift+B를 누르세요.</p>
        <ol className="mt-6 list-decimal space-y-2 border-t border-slate-200 pt-4 pl-5 text-sm">
          <li>원하는 벅스 앨범 페이지를 열고 방금 저장한 북마크를 누르세요.</li>
          <li>열린 뷰어에서 복사·저장할 권한이 있는 곡을 선택하고 <strong>가져와 저장</strong>을 누르세요.</li>
        </ol>
        <div className="mt-5 flex flex-wrap gap-4 text-sm font-medium text-indigo-700">
          <a href="https://music.bugs.co.kr/album/20430411" className="underline">《독립음악》으로 해보기 ↗</a>
          <a href="./" className="underline">가사 뷰어 열기</a>
        </div>
      </div>
    </main>
  );
}
