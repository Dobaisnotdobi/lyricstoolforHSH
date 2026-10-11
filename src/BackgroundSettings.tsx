import type { ViewerSettings } from './types';
import { cn } from './utils';

const PRESETS = [
  { name: '라벤더', start: '#fdf2f8', end: '#ede9fe', angle: 135, textColor: '#1e293b' },
  { name: '하늘', start: '#eff6ff', end: '#cffafe', angle: 135, textColor: '#1e293b' },
  { name: '민트', start: '#ecfdf5', end: '#ccfbf1', angle: 135, textColor: '#1e293b' },
  { name: '차콜', start: '#171717', end: '#303030', angle: 135, textColor: '#e5e5e5' },
  { name: '숲', start: '#14211c', end: '#263b30', angle: 135, textColor: '#e5e5e5' },
  { name: '자두', start: '#221923', end: '#3b293b', angle: 135, textColor: '#e5e5e5' },
];

export function BackgroundSettings({ settings, onChange }: {
  settings: ViewerSettings;
  onChange: (changes: Partial<ViewerSettings>) => void;
}) {
  return (
    <section aria-label="배경 설정" className="space-y-3">
      <h4 className="text-xs font-semibold text-slate-500 dark:text-neutral-400 uppercase tracking-wider">배경 색상</h4>
      <div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-neutral-800 p-1 rounded-lg">
        {(['solid', 'gradient'] as const).map(mode => (
          <button
            key={mode}
            aria-pressed={settings.backgroundMode === mode}
            onClick={() => onChange({ backgroundMode: mode })}
            className={cn('py-1.5 rounded-md text-xs font-medium transition-colors',
              settings.backgroundMode === mode ? 'bg-white dark:bg-neutral-900 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-100')}
          >{mode === 'solid' ? '단색' : '그라데이션'}</button>
        ))}
      </div>

      {settings.backgroundMode === 'solid' ? (
        <div className="flex flex-wrap gap-2">
          {['#ffffff', '#f8fafc', '#1e293b', '#0f172a', '#fef2f2', '#f0fdf4'].map(color => (
            <button
              key={color}
              aria-label={`배경색 ${color}`}
              aria-pressed={settings.backgroundColor === color}
              onClick={() => onChange({ backgroundColor: color })}
              className={cn('w-8 h-8 rounded-full border border-slate-200 dark:border-neutral-700 transition-transform hover:scale-110',
                settings.backgroundColor === color && 'ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-neutral-900')}
              style={{ backgroundColor: color }}
            />
          ))}
          <input type="color" aria-label="사용자 지정 배경색" value={settings.backgroundColor}
            onChange={e => onChange({ backgroundColor: e.target.value })}
            className="w-8 h-8 rounded-full border-none p-0 overflow-hidden cursor-pointer" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2" aria-label="그라데이션 프리셋">
            {PRESETS.map(preset => {
              const selected = settings.gradientStart === preset.start && settings.gradientEnd === preset.end && settings.gradientAngle === preset.angle;
              return (
                <button key={preset.name} aria-pressed={selected} aria-label={`${preset.name} 그라데이션`}
                  onClick={() => onChange({ gradientStart: preset.start, gradientEnd: preset.end, gradientAngle: preset.angle, textColor: preset.textColor })}
                  className={cn('rounded-lg border border-slate-200 dark:border-neutral-700 p-1 text-xs text-slate-600 dark:text-neutral-300 hover:border-indigo-400', selected && 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-neutral-900')}>
                  <span className="block h-9 rounded-md mb-1" style={{ backgroundImage: `linear-gradient(${preset.angle}deg, ${preset.start}, ${preset.end})` }} />
                  {preset.name}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-neutral-400">프리셋을 선택하면 배경에 맞는 글자색도 적용됩니다. 글자색은 다시 변경할 수 있습니다.</p>
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold text-slate-500 dark:text-neutral-400 mb-2">직접 설정</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-600 dark:text-neutral-300 space-y-1 block">
                <span>시작 색상</span>
                <input type="color" value={settings.gradientStart} onChange={e => onChange({ gradientStart: e.target.value })}
                  className="block w-full h-9 cursor-pointer rounded border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-1" />
                <span className="block font-mono text-[10px] text-slate-400 dark:text-neutral-400">{settings.gradientStart}</span>
              </label>
              <label className="text-xs text-slate-600 dark:text-neutral-300 space-y-1 block">
                <span>끝 색상</span>
                <input type="color" value={settings.gradientEnd} onChange={e => onChange({ gradientEnd: e.target.value })}
                  className="block w-full h-9 cursor-pointer rounded border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-1" />
                <span className="block font-mono text-[10px] text-slate-400 dark:text-neutral-400">{settings.gradientEnd}</span>
              </label>
            </div>
            <label className="block text-xs text-slate-600 dark:text-neutral-300">
              <span className="flex justify-between mb-2"><span>방향</span><span className="font-mono">{settings.gradientAngle}°</span></span>
              <input type="range" min="0" max="360" step="1" value={settings.gradientAngle}
                onChange={e => onChange({ gradientAngle: Number(e.target.value) })}
                className="w-full accent-indigo-600" />
            </label>
            <button onClick={() => onChange({ gradientStart: settings.gradientEnd, gradientEnd: settings.gradientStart })}
              className="w-full py-2 text-xs font-medium text-slate-600 dark:text-neutral-300 bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-700 rounded-lg">색상 순서 바꾸기</button>
          </fieldset>
        </div>
      )}
    </section>
  );
}
