// Localization. Strings live in one table per language, keyed by id; markup marks translatable
// text with data-i18n (text) or data-i18n-attr="attr:key;attr:key". Missing keys fall back to
// English, so a partial translation is always usable. Arabic switches the document to RTL.
//
// Coverage today: the application shell (top bar, figure bar, Home, menus, mobile tabs,
// disclaimers). Lesson, case and instrument text is English only; it is written as data (not
// baked into SVG) so it can be added here without code changes.

const EN = {
  'app.name': 'Portal Pressure Simulator',
  'app.tagline': 'A living, physics-based model of the portal circulation. Raise a resistance anywhere from the gut to the heart and blood finds another way.',
  'app.disclaimer': 'Educational simulation. Simplified model with illustrative values; not for diagnosis or treatment decisions.',
  'top.patient': 'Patient', 'top.search': 'Search', 'top.chart': 'Side panel', 'top.panel.show': 'Show side panel', 'top.panel.hide': 'Hide side panel', 'top.share': 'Share and export', 'top.menu': 'Menu',
  'bar.anatomy': 'Anatomy', 'bar.circuit': 'Circuit', 'bar.lens': 'Lens', 'bar.lobule': 'Lobule', 'bar.sinusoid': 'Sinusoid', 'bar.instruments': 'Instruments', 'bar.figure': 'Figure',
  'home.explore': 'Explore a patient', 'home.explore.d': 'Start healthy, or open any of 16 patients.',
  'home.lessons': 'Lessons', 'home.cases': 'Cases', 'home.cases.d': 'A bleed at 3 a.m. and three diagnostic puzzles, scored',
  'home.presenter': 'Presenter', 'home.presenter.d': 'Step through a live model in front of a class',
  'menu.appearance': 'Appearance', 'menu.light': 'Light', 'menu.dark': 'Dark', 'menu.system': 'System', 'menu.units': 'Units', 'menu.role': 'I am a…',
  'menu.language': 'Language', 'menu.access': 'Accessibility', 'menu.describe': 'Describe the patient', 'menu.sonify': 'Sonify pressure', 'menu.narrator': 'Narrator caption',
  'menu.settings': 'Settings', 'menu.help': 'Help', 'menu.reset': 'Reset everything…', 'menu.shortcuts': 'Keyboard shortcuts', 'menu.refs': 'References', 'menu.credits': 'Credits',
  'menu.home': 'Home', 'menu.palette': 'Search', 'menu.guide': 'Guide', 'menu.about': 'About the model', 'menu.privacy': 'Privacy',
  'tabs.chart': 'Patient', 'tabs.instruments': 'Measure',
};
const ES = {
  'app.tagline': 'Un modelo vivo y basado en la física de la circulación portal. Aumente una resistencia en cualquier punto entre el intestino y el corazón y la sangre encontrará otro camino.',
  'app.disclaimer': 'Simulación educativa. Modelo simplificado con valores ilustrativos; no apto para decisiones diagnósticas ni terapéuticas.',
  'top.patient': 'Paciente', 'top.search': 'Buscar', 'top.chart': 'Panel lateral', 'top.panel.show': 'Mostrar el panel lateral', 'top.panel.hide': 'Ocultar el panel lateral', 'menu.settings': 'Ajustes', 'menu.help': 'Ayuda', 'menu.reset': 'Restablecer todo…', 'top.share': 'Compartir y exportar', 'top.menu': 'Menú',
  'bar.anatomy': 'Anatomía', 'bar.circuit': 'Circuito', 'bar.lens': 'Lente', 'bar.lobule': 'Lobulillo', 'bar.sinusoid': 'Sinusoide', 'bar.instruments': 'Instrumentos', 'bar.figure': 'Figura',
  'home.explore': 'Explorar un paciente', 'home.explore.d': 'Empiece sano o abra cualquiera de los 16 pacientes.',
  'home.lessons': 'Lecciones', 'home.cases': 'Casos', 'home.cases.d': 'Una hemorragia a las 3 a. m. y tres enigmas diagnósticos, con puntuación',
  'home.presenter': 'Presentador', 'home.presenter.d': 'Recorra un modelo vivo ante la clase',
  'menu.appearance': 'Apariencia', 'menu.light': 'Claro', 'menu.dark': 'Oscuro', 'menu.system': 'Sistema', 'menu.units': 'Unidades', 'menu.role': 'Soy…',
  'menu.language': 'Idioma', 'menu.access': 'Accesibilidad', 'menu.describe': 'Describir al paciente', 'menu.sonify': 'Sonificar la presión', 'menu.narrator': 'Narrador',
  'menu.home': 'Inicio', 'menu.palette': 'Buscar', 'menu.guide': 'Guía', 'menu.about': 'Acerca del modelo', 'menu.privacy': 'Privacidad',
  'tabs.chart': 'Paciente', 'tabs.instruments': 'Medir',
};
const FR = {
  'app.tagline': 'Un modèle vivant, fondé sur la physique, de la circulation portale. Augmentez une résistance n’importe où entre l’intestin et le cœur : le sang trouve un autre chemin.',
  'app.disclaimer': 'Simulation pédagogique. Modèle simplifié aux valeurs illustratives ; ne pas utiliser pour le diagnostic ni le traitement.',
  'top.patient': 'Patient', 'top.search': 'Rechercher', 'top.chart': 'Panneau latéral', 'top.panel.show': 'Afficher le panneau latéral', 'top.panel.hide': 'Masquer le panneau latéral', 'menu.settings': 'Réglages', 'menu.help': 'Aide', 'menu.reset': 'Tout réinitialiser…', 'top.share': 'Partager et exporter', 'top.menu': 'Menu',
  'bar.anatomy': 'Anatomie', 'bar.circuit': 'Circuit', 'bar.lens': 'Filtre', 'bar.lobule': 'Lobule', 'bar.sinusoid': 'Sinusoïde', 'bar.instruments': 'Instruments', 'bar.figure': 'Figure',
  'home.explore': 'Explorer un patient', 'home.explore.d': 'Commencez sain ou ouvrez l’un des 16 patients.',
  'home.lessons': 'Leçons', 'home.cases': 'Cas', 'home.cases.d': 'Une hémorragie à 3 h du matin et trois énigmes diagnostiques, notées',
  'home.presenter': 'Présentateur', 'home.presenter.d': 'Faites défiler un modèle vivant devant la classe',
  'menu.appearance': 'Apparence', 'menu.light': 'Clair', 'menu.dark': 'Sombre', 'menu.system': 'Système', 'menu.units': 'Unités', 'menu.role': 'Je suis…',
  'menu.language': 'Langue', 'menu.access': 'Accessibilité', 'menu.describe': 'Décrire le patient', 'menu.sonify': 'Sonifier la pression', 'menu.narrator': 'Narrateur',
  'menu.home': 'Accueil', 'menu.palette': 'Rechercher', 'menu.guide': 'Guide', 'menu.about': 'À propos du modèle', 'menu.privacy': 'Confidentialité',
  'tabs.chart': 'Patient', 'tabs.instruments': 'Mesurer',
};
const PT = {
  'app.tagline': 'Um modelo vivo, baseado na física, da circulação portal. Aumente uma resistência em qualquer ponto entre o intestino e o coração e o sangue encontra outro caminho.',
  'app.disclaimer': 'Simulação educacional. Modelo simplificado com valores ilustrativos; não usar para decisões diagnósticas ou terapêuticas.',
  'top.patient': 'Paciente', 'top.search': 'Pesquisar', 'top.chart': 'Painel lateral', 'top.panel.show': 'Mostrar o painel lateral', 'top.panel.hide': 'Ocultar o painel lateral', 'menu.settings': 'Definições', 'menu.help': 'Ajuda', 'menu.reset': 'Repor tudo…', 'top.share': 'Partilhar e exportar', 'top.menu': 'Menu',
  'bar.anatomy': 'Anatomia', 'bar.circuit': 'Circuito', 'bar.lens': 'Lente', 'bar.lobule': 'Lóbulo', 'bar.sinusoid': 'Sinusoide', 'bar.instruments': 'Instrumentos', 'bar.figure': 'Figura',
  'home.explore': 'Explorar um paciente', 'home.explore.d': 'Comece saudável ou abra qualquer um dos 16 pacientes.',
  'home.lessons': 'Lições', 'home.cases': 'Casos', 'home.cases.d': 'Uma hemorragia às 3 da manhã e três enigmas diagnósticos, pontuados',
  'home.presenter': 'Apresentador', 'home.presenter.d': 'Percorra um modelo vivo diante da turma',
  'menu.appearance': 'Aparência', 'menu.light': 'Claro', 'menu.dark': 'Escuro', 'menu.system': 'Sistema', 'menu.units': 'Unidades', 'menu.role': 'Eu sou…',
  'menu.language': 'Idioma', 'menu.access': 'Acessibilidade', 'menu.describe': 'Descrever o paciente', 'menu.sonify': 'Sonificar a pressão', 'menu.narrator': 'Narrador',
  'menu.home': 'Início', 'menu.palette': 'Buscar', 'menu.guide': 'Guia', 'menu.about': 'Sobre o modelo', 'menu.privacy': 'Privacidade',
  'tabs.chart': 'Paciente', 'tabs.instruments': 'Medir',
};
const AR = {
  'app.name': 'محاكي ضغط الوريد البابي',
  'app.tagline': 'نموذج حيّ قائم على الفيزياء للدوران البابي. ارفع المقاومة في أي موضع بين الأمعاء والقلب فيجد الدم طريقًا آخر.',
  'app.disclaimer': 'محاكاة تعليمية. نموذج مبسّط بقيم توضيحية؛ لا يُستخدم لاتخاذ قرارات التشخيص أو العلاج.',
  'top.patient': 'المريض', 'top.search': 'بحث', 'top.chart': 'اللوحة الجانبية', 'top.panel.show': 'إظهار اللوحة الجانبية', 'top.panel.hide': 'إخفاء اللوحة الجانبية', 'menu.settings': 'الإعدادات', 'menu.help': 'المساعدة', 'menu.reset': 'إعادة ضبط كل شيء…', 'top.share': 'مشاركة وتصدير', 'top.menu': 'القائمة',
  'bar.anatomy': 'التشريح', 'bar.circuit': 'الدائرة', 'bar.lens': 'العدسة', 'bar.lobule': 'الفصيص', 'bar.sinusoid': 'الجيب', 'bar.instruments': 'الأدوات', 'bar.figure': 'الشكل',
  'home.explore': 'استكشف مريضًا', 'home.explore.d': 'ابدأ بحالة سليمة أو افتح أيًّا من 16 مريضًا.',
  'home.lessons': 'الدروس', 'home.cases': 'الحالات', 'home.cases.d': 'نزيف في الثالثة فجرًا وثلاثة ألغاز تشخيصية مع تقييم',
  'home.presenter': 'العرض', 'home.presenter.d': 'اعرض نموذجًا حيًّا خطوة بخطوة أمام الصف',
  'menu.appearance': 'المظهر', 'menu.light': 'فاتح', 'menu.dark': 'داكن', 'menu.system': 'النظام', 'menu.units': 'الوحدات', 'menu.role': 'أنا…',
  'menu.language': 'اللغة', 'menu.access': 'إمكانية الوصول', 'menu.describe': 'صِف حالة المريض', 'menu.sonify': 'تحويل الضغط إلى صوت',
  'menu.home': 'الرئيسية', 'menu.palette': 'بحث', 'menu.guide': 'الدليل', 'menu.about': 'عن النموذج', 'menu.privacy': 'الخصوصية',
  'tabs.chart': 'المريض', 'tabs.instruments': 'القياس',
};

export const LANGS = [['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['pt', 'Português'], ['ar', 'العربية']];
const TABLE = { en: EN, es: ES, fr: FR, pt: PT, ar: AR };
const RTL = new Set(['ar']);

let lang = (() => {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    const saved = q || localStorage.getItem('pps.lang') || (navigator.language || 'en').slice(0, 2);
    return TABLE[saved] ? saved : 'en';
  } catch { return 'en'; }
})();

export const t = (key) => TABLE[lang]?.[key] ?? EN[key] ?? key;
export const currentLang = () => lang;

/** Fill every [data-i18n] / [data-i18n-attr] under root and set the document language/direction. */
export function applyI18n(root = document) {
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL.has(lang) ? 'rtl' : 'ltr';
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(';')) { const [attr, key] = pair.split(':'); if (attr && key) el.setAttribute(attr, t(key)); }
  });
}
export function setLang(l) {
  if (!TABLE[l]) return;
  lang = l;
  try { localStorage.setItem('pps.lang', l); } catch { /* storage unavailable */ }
  applyI18n();
  dispatchEvent(new CustomEvent('pps:lang', { detail: l }));
}
