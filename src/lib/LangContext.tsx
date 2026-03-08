'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Language } from '@/types';
import { t as translate, monthName as mn } from '@/i18n';

interface LangCtx {
  lang: Language; setLang: (l: Language) => void;
  t: (k: string) => string;
  dir: 'rtl' | 'ltr';
  isRTL: boolean;
  monthName: (m: number) => string;
}

const Ctx = createContext<LangCtx>({
  lang: 'ar', setLang: () => {},
  t: k => k, dir: 'rtl', isRTL: true, monthName: () => '',
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>('ar');

  useEffect(() => {
    const s = localStorage.getItem('lang') as Language;
    if (s === 'ar' || s === 'en') { setLangState(s); applyDir(s); }
    else applyDir('ar');
  }, []);

  function applyDir(l: Language) {
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = l;
  }

  function setLang(l: Language) {
    setLangState(l);
    localStorage.setItem('lang', l);
    applyDir(l);
  }

  return (
    <Ctx.Provider value={{
      lang, setLang,
      t: (k: string) => translate(lang, k),
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      isRTL: lang === 'ar',
      monthName: (m: number) => mn(lang, m),
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useLang() { return useContext(Ctx); }
