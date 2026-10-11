import { useEffect, useState } from 'react';

export type UiTheme = 'light' | 'dark' | 'system';

export function useUiTheme() {
  const [theme, setTheme] = useState<UiTheme>(() => {
    const saved = localStorage.getItem('lyrics-ui-theme');
    return saved === 'dark' || saved === 'system' ? saved : 'light';
  });
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    localStorage.setItem('lyrics-ui-theme', theme);
  }, [theme]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return { theme, setTheme, isDark: theme === 'dark' || (theme === 'system' && systemDark) };
}
