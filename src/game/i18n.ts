/**
 * Tiny i18n dictionary. Every language must supply every key - the
 * Record<Lang, Record<Key, string>> type makes a missing string a build error.
 */
export const LANGS = ['en', 'ru', 'tr', 'es', 'pt', 'uz'] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_NAMES: Readonly<Record<Lang, string>> = {
  en: 'English',
  ru: 'Русский',
  tr: 'Türkçe',
  es: 'Español',
  pt: 'Português',
  uz: 'Oʻzbekcha',
};

const en = {
  title: 'ARROW',
  titleSub: 'Escape',
  tagline: 'Tap an arrow with a clear path',
  play: 'PLAY',
  levels: 'LEVELS',
  settings: 'SETTINGS',
  back: 'BACK',
  chapter: 'Chapter',
  chapter1: 'Rocket',
  chapter2: 'Comet',
  chapter3: 'Nebula',
  level: 'Level',
  levelShort: 'Lv.',
  locked: 'Locked',
  undo: 'UNDO',
  hint: 'HINT',
  restart: 'RESTART',
  cleared: 'CLEARED',
  perfect: 'Perfect clear',
  usedHelp: 'Cleared with help',
  nextLevel: 'NEXT LEVEL',
  backToLevels: 'LEVELS',
  blocked: 'Blocked - clear its path first',
  noFreeArrow: 'No free arrow right now',
  adFailed: 'Ad unavailable, try again later',
  watchAd: 'Watch ad',
  tapHint: 'Tap!',
  noHearts: 'Out of hearts',
  noHeartsSub: 'Refill and keep going',
  refill: 'REFILL',
  sound: 'Sound',
  on: 'ON',
  off: 'OFF',
  language: 'Language',
  loading: 'LOADING',
  privacy: 'Privacy Policy',
  totalStars: 'Stars',
  allClear: 'All levels cleared!',
  tapAnywhere: 'Tap to continue',
} as const;

export type Key = keyof typeof en;

const ru: Record<Key, string> = {
  title: 'СТРЕЛКИ',
  titleSub: 'Побег',
  tagline: 'Нажми на стрелку со свободным путём',
  play: 'ИГРАТЬ',
  levels: 'УРОВНИ',
  settings: 'НАСТРОЙКИ',
  back: 'НАЗАД',
  chapter: 'Глава',
  chapter1: 'Ракета',
  chapter2: 'Комета',
  chapter3: 'Туманность',
  level: 'Уровень',
  levelShort: 'Ур.',
  locked: 'Закрыто',
  undo: 'ОТМЕНА',
  hint: 'ПОДСКАЗКА',
  restart: 'ЗАНОВО',
  cleared: 'ОЧИЩЕНО',
  perfect: 'Идеально',
  usedHelp: 'Пройдено с помощью',
  nextLevel: 'ДАЛЬШЕ',
  backToLevels: 'УРОВНИ',
  blocked: 'Путь занят - сначала освободи его',
  noFreeArrow: 'Свободных стрелок нет',
  adFailed: 'Реклама недоступна, попробуй позже',
  watchAd: 'Смотреть рекламу',
  tapHint: 'Нажми!',
  noHearts: 'Жизни кончились',
  noHeartsSub: 'Пополни и продолжай',
  refill: 'ПОПОЛНИТЬ',
  sound: 'Звук',
  on: 'ВКЛ',
  off: 'ВЫКЛ',
  language: 'Язык',
  loading: 'ЗАГРУЗКА',
  privacy: 'Политика конфиденциальности',
  totalStars: 'Звёзды',
  allClear: 'Все уровни пройдены!',
  tapAnywhere: 'Нажми, чтобы продолжить',
};

const tr: Record<Key, string> = {
  title: 'OKLAR',
  titleSub: 'Kaçış',
  tagline: 'Yolu açık olan bir oka dokun',
  play: 'OYNA',
  levels: 'BÖLÜMLER',
  settings: 'AYARLAR',
  back: 'GERİ',
  chapter: 'Bölüm',
  chapter1: 'Roket',
  chapter2: 'Kuyruklu Yıldız',
  chapter3: 'Bulutsu',
  level: 'Seviye',
  levelShort: 'Sv.',
  locked: 'Kilitli',
  undo: 'GERİ AL',
  hint: 'İPUCU',
  restart: 'YENİDEN',
  cleared: 'TEMİZLENDİ',
  perfect: 'Kusursuz',
  usedHelp: 'Yardımla tamamlandı',
  nextLevel: 'SONRAKİ',
  backToLevels: 'SEVİYELER',
  blocked: 'Yolu kapalı - önce onu aç',
  noFreeArrow: 'Şu an serbest ok yok',
  adFailed: 'Reklam yok, sonra dene',
  watchAd: 'Reklam izle',
  tapHint: 'Dokun!',
  noHearts: 'Can bitti',
  noHeartsSub: 'Doldur ve devam et',
  refill: 'DOLDUR',
  sound: 'Ses',
  on: 'AÇIK',
  off: 'KAPALI',
  language: 'Dil',
  loading: 'YÜKLENİYOR',
  privacy: 'Gizlilik Politikası',
  totalStars: 'Yıldız',
  allClear: 'Tüm seviyeler bitti!',
  tapAnywhere: 'Devam için dokun',
};

const es: Record<Key, string> = {
  title: 'FLECHAS',
  titleSub: 'Escape',
  tagline: 'Toca una flecha con el camino libre',
  play: 'JUGAR',
  levels: 'NIVELES',
  settings: 'AJUSTES',
  back: 'ATRÁS',
  chapter: 'Capítulo',
  chapter1: 'Cohete',
  chapter2: 'Cometa',
  chapter3: 'Nebulosa',
  level: 'Nivel',
  levelShort: 'Nv.',
  locked: 'Bloqueado',
  undo: 'DESHACER',
  hint: 'PISTA',
  restart: 'REINICIAR',
  cleared: 'COMPLETADO',
  perfect: 'Perfecto',
  usedHelp: 'Completado con ayuda',
  nextLevel: 'SIGUIENTE',
  backToLevels: 'NIVELES',
  blocked: 'Bloqueada - libera su camino',
  noFreeArrow: 'No hay flechas libres',
  adFailed: 'Anuncio no disponible',
  watchAd: 'Ver anuncio',
  tapHint: '¡Toca!',
  noHearts: 'Sin vidas',
  noHeartsSub: 'Recarga y sigue jugando',
  refill: 'RECARGAR',
  sound: 'Sonido',
  on: 'SÍ',
  off: 'NO',
  language: 'Idioma',
  loading: 'CARGANDO',
  privacy: 'Política de privacidad',
  totalStars: 'Estrellas',
  allClear: '¡Todos los niveles completados!',
  tapAnywhere: 'Toca para continuar',
};

const pt: Record<Key, string> = {
  title: 'SETAS',
  titleSub: 'Fuga',
  tagline: 'Toque numa seta com caminho livre',
  play: 'JOGAR',
  levels: 'NÍVEIS',
  settings: 'AJUSTES',
  back: 'VOLTAR',
  chapter: 'Capítulo',
  chapter1: 'Foguete',
  chapter2: 'Cometa',
  chapter3: 'Nebulosa',
  level: 'Nível',
  levelShort: 'Nv.',
  locked: 'Bloqueado',
  undo: 'DESFAZER',
  hint: 'DICA',
  restart: 'REINICIAR',
  cleared: 'CONCLUÍDO',
  perfect: 'Perfeito',
  usedHelp: 'Concluído com ajuda',
  nextLevel: 'PRÓXIMO',
  backToLevels: 'NÍVEIS',
  blocked: 'Bloqueada - libere o caminho',
  noFreeArrow: 'Nenhuma seta livre',
  adFailed: 'Anúncio indisponível',
  watchAd: 'Ver anúncio',
  tapHint: 'Toque!',
  noHearts: 'Sem vidas',
  noHeartsSub: 'Recarregue e continue',
  refill: 'RECARREGAR',
  sound: 'Som',
  on: 'LIG',
  off: 'DESL',
  language: 'Idioma',
  loading: 'CARREGANDO',
  privacy: 'Política de Privacidade',
  totalStars: 'Estrelas',
  allClear: 'Todos os níveis concluídos!',
  tapAnywhere: 'Toque para continuar',
};

const uz: Record<Key, string> = {
  title: 'STRELKALAR',
  titleSub: 'Qochish',
  tagline: 'Yoʻli boʻsh strelkani bosing',
  play: 'OʻYNASH',
  levels: 'BOSQICHLAR',
  settings: 'SOZLAMALAR',
  back: 'ORQAGA',
  chapter: 'Bob',
  chapter1: 'Raketa',
  chapter2: 'Kometa',
  chapter3: 'Tumanlik',
  level: 'Bosqich',
  levelShort: 'B.',
  locked: 'Yopiq',
  undo: 'QAYTARISH',
  hint: 'MASLAHAT',
  restart: 'QAYTA',
  cleared: 'TOZALANDI',
  perfect: 'Mukammal',
  usedHelp: 'Yordam bilan',
  nextLevel: 'KEYINGI',
  backToLevels: 'BOSQICHLAR',
  blocked: 'Yoʻli band - avval uni boʻshating',
  noFreeArrow: 'Hozir boʻsh strelka yoʻq',
  adFailed: 'Reklama mavjud emas',
  watchAd: 'Reklamani koʻrish',
  tapHint: 'Bosing!',
  noHearts: 'Yuraklar tugadi',
  noHeartsSub: 'Toʻldiring va davom eting',
  refill: 'TOʻLDIRISH',
  sound: 'Ovoz',
  on: 'YOQ',
  off: 'OʻCH',
  language: 'Til',
  loading: 'YUKLANMOQDA',
  privacy: 'Maxfiylik siyosati',
  totalStars: 'Yulduzlar',
  allClear: 'Barcha bosqichlar tugadi!',
  tapAnywhere: 'Davom etish uchun bosing',
};

const DICT: Record<Lang, Record<Key, string>> = { en, ru, tr, es, pt, uz };

let current: Lang = 'en';

export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value);
}

/** Pick the closest supported language for a portal/browser code. */
export function normalizeLang(value: string | undefined): Lang {
  if (!value) return 'en';
  const short = value.slice(0, 2).toLowerCase();
  return isLang(short) ? short : 'en';
}

export function setLang(value: string): Lang {
  current = normalizeLang(value);
  return current;
}

export function getLang(): Lang {
  return current;
}

/** Translate. `{0}`, `{1}` ... are replaced by the extra arguments. */
export function t(key: Key, ...params: Array<string | number>): string {
  const table = DICT[current] ?? en;
  let text = table[key] ?? en[key];
  params.forEach((value, i) => {
    text = text.replace(`{${i}}`, String(value));
  });
  return text;
}

/** Chapter titles are per-chapter keys; this keeps callers out of the dictionary. */
export function chapterName(index: number): string {
  if (index === 0) return t('chapter1');
  if (index === 1) return t('chapter2');
  return t('chapter3');
}
