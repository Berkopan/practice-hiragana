import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { KANA, GROUPS, type Kana } from './data/kana';
import { WritingPad, type WritingPadHandle, type Stroke } from './components/WritingPad';
import { getRecognizer, type RecognitionResult } from './lib/recognition';
import { Icon } from './components/Icons';
import './App.css';

type PracticeMode = 'copy' | 'recall' | 'mixed';
type QuestionMode = 'copy' | 'recall';
type Modal = 'characters' | 'help' | 'progress' | null;
type CharacterRecord = { attempts: number; correct: number; lastResult: 'correct' | 'incorrect'; lastPracticed: number };
type Progress = { records: Record<string, CharacterRecord>; streak: number; bestStreak: number; days: Record<string, { attempts: number; correct: number }> };
type Preferences = { mode: PracticeMode; groups: string[]; pencilOnly: boolean };
const PROGRESS_KEY = 'practice-hiragana.progress.v1';
const PREFERENCES_KEY = 'practice-hiragana.preferences.v1';
const BASE = import.meta.env.BASE_URL;
const repoUrl = 'https://github.com/Berkopan/practice-hiragana';
const allGroups = GROUPS.map(group => group.id);
const initialProgress: Progress = { records: {}, streak: 0, bestStreak: 0, days: {} };

function readPreferences(): Preferences {
  const defaults: Preferences = { mode: 'mixed', groups: [...allGroups], pencilOnly: false };
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return defaults;
    const groups = Array.isArray(value.groups) ? value.groups.filter((id: unknown) => typeof id === 'string' && allGroups.includes(id)) : defaults.groups;
    return {
      mode: ['copy', 'recall', 'mixed'].includes(value.mode) ? value.mode : defaults.mode,
      groups: groups.length ? [...new Set<string>(groups)] : defaults.groups,
      pencilOnly: value.pencilOnly === true,
    };
  } catch { return defaults; }
}

function readProgress(): Progress {
  try {
    const value = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return initialProgress;
    const records: Progress['records'] = {};
    for (const kana of KANA) {
      const record = value.records?.[kana.id];
      if (record && Number.isSafeInteger(record.attempts) && record.attempts > 0 && Number.isSafeInteger(record.correct) && record.correct >= 0 && record.correct <= record.attempts && ['correct', 'incorrect'].includes(record.lastResult)) {
        records[kana.id] = { attempts: record.attempts, correct: record.correct, lastResult: record.lastResult, lastPracticed: Number.isFinite(record.lastPracticed) ? record.lastPracticed : 0 };
      }
    }
    const days: Progress['days'] = {};
    for (const [key, record] of Object.entries(value.days ?? {}) as [string, { attempts?: number; correct?: number }][]) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key) && record && Number.isSafeInteger(record.attempts) && (record.attempts ?? -1) >= 0 && Number.isSafeInteger(record.correct) && (record.correct ?? -1) >= 0 && record.correct! <= record.attempts!) days[key] = { attempts: record.attempts!, correct: record.correct! };
    }
    return { records, days, streak: Number.isSafeInteger(value.streak) && value.streak >= 0 ? value.streak : 0, bestStreak: Number.isSafeInteger(value.bestStreak) && value.bestStreak >= 0 ? value.bestStreak : 0 };
  } catch { return initialProgress; }
}

function localDay() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function shuffled<T>(values: T[]): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function Dialog({ title, eyebrow, onClose, children, className = '' }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog className={`modal ${className}`} ref={ref} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="dialog-title">
    <div className="modal-inner">
      <header className="modal-header">
        <div><p className="eyebrow">{eyebrow}</p><h2 id="dialog-title">{title}</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Pencereyi kapat"><Icon name="close" /></button>
      </header>
      {children}
    </div>
  </dialog>;
}

function StrokeDemo({ kana }: { kana: Kana }) {
  return <svg className="stroke-demo" viewBox="0 0 109 109" role="img" aria-label={`${kana.char} için ${kana.strokes.length} çizgilik yazım sırası`}>
    {kana.strokes.map((path, i) => <path key={`${kana.id}-${i}`} d={path} fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" pathLength="1" style={{ '--stroke-delay': `${i * 0.75}s` } as CSSProperties} />)}
  </svg>;
}

function HandwrittenKana({ kana }: { kana: Kana }) {
  return <svg className="prompt-kana" viewBox="0 0 109 109" role="img" aria-label={kana.char} lang="ja">{kana.strokes.map((path, i) => <path key={i} d={path} fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />)}</svg>;
}

export default function App() {
  const [preferences, setPreferences] = useState(readPreferences);
  const [progress, setProgress] = useState(readProgress);
  const [current, setCurrent] = useState<Kana>(() => {
    const preferences = readPreferences();
    const pool = KANA.filter(kana => preferences.groups.includes(kana.group));
    return pool[Math.floor(Math.random() * pool.length)] ?? KANA[0];
  });
  const [questionMode, setQuestionMode] = useState<QuestionMode>(() => preferences.mode === 'mixed' ? (Math.random() > 0.5 ? 'copy' : 'recall') : preferences.mode);
  const [round, setRound] = useState(1);
  const [strokeCount, setStrokeCount] = useState(0);
  const [showGuide, setShowGuide] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [demoKey, setDemoKey] = useState(0);
  const [usedHint, setUsedHint] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [modelState, setModelState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [modelProgress, setModelProgress] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const pad = useRef<WritingPadHandle>(null);
  const recognizer = useRef<Awaited<ReturnType<typeof getRecognizer>> | null>(null);
  const loadGeneration = useRef(0);
  const recognitionGeneration = useRef(0);
  const questionToken = useRef(0);
  const drawingRevision = useRef(0);
  const recordedRevision = useRef(-1);
  const bag = useRef<{ key: string; ids: string[] }>({ key: '', ids: [] });
  const today = progress.days[localDay()] ?? { attempts: 0, correct: 0 };
  const weakIds = Object.entries(progress.records).filter(([, value]) => value.lastResult === 'incorrect').map(([id]) => id);
  const selectedKana = KANA.filter(kana => preferences.groups.includes(kana.group));
  const availableWeak = selectedKana.filter(kana => weakIds.includes(kana.id));
  const totalAttempts = Object.values(progress.records).reduce((sum, record) => sum + record.attempts, 0);
  const totalCorrect = Object.values(progress.records).reduce((sum, record) => sum + record.correct, 0);
  const practicedCount = Object.keys(progress.records).length;

  const loadModel = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setModelState('loading');
    setModelProgress(0);
    setCheckError(null);
    try {
      const model = await getRecognizer({ onProgress: value => { if (generation === loadGeneration.current) setModelProgress(value); } });
      if (generation !== loadGeneration.current) return;
      recognizer.current = model;
      setModelState('ready');
    } catch {
      if (generation === loadGeneration.current) setModelState('error');
    }
  }, []);

  useEffect(() => { void loadModel(); return () => { loadGeneration.current++; }; }, [loadModel]);
  useEffect(() => {
    try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences)); } catch { setStorageAvailable(false); }
  }, [preferences]);
  useEffect(() => {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { setStorageAvailable(false); }
  }, [progress]);

  function resetDrawing() {
    questionToken.current++;
    pad.current?.clear();
    drawingRevision.current++;
    recordedRevision.current = -1;
    setStrokeCount(0);
    setResult(null);
    setCheckError(null);
    setChecking(false);
    setShowGuide(false);
    setShowDemo(false);
    setUsedHint(false);
  }

  function chooseNext({ groups = preferences.groups, mode = preferences.mode, weak = reviewOnly, specific }: { groups?: string[]; mode?: PracticeMode; weak?: boolean; specific?: Kana } = {}) {
    const candidates = KANA.filter(kana => groups.includes(kana.group));
    const weakCandidates = candidates.filter(kana => weakIds.includes(kana.id));
    const pool = weak && weakCandidates.length ? weakCandidates : candidates;
    const key = `${groups.join(',')}:${weak ? weakIds.join(',') : 'all'}`;
    if (bag.current.key !== key || !bag.current.ids.length) {
      const ids = shuffled(pool.map(kana => kana.id));
      if (ids.length > 1 && ids[0] === current.id) [ids[0], ids[1]] = [ids[1], ids[0]];
      bag.current = { key, ids };
    }
    if (!specific && pool.length > 1 && bag.current.ids[0] === current.id) {
      if (bag.current.ids.length > 1) bag.current.ids.push(bag.current.ids.shift()!);
      else bag.current.ids = shuffled(pool.filter(kana => kana.id !== current.id).map(kana => kana.id));
    }
    const next = specific ?? KANA.find(kana => kana.id === bag.current.ids.shift()) ?? pool[0] ?? KANA[0];
    resetDrawing();
    setCurrent(next);
    setQuestionMode(mode === 'mixed' ? (Math.random() > 0.5 ? 'copy' : 'recall') : mode);
    setRound(value => value + 1);
  }

  function changeMode(mode: PracticeMode) {
    if (mode === preferences.mode) return;
    setPreferences(value => ({ ...value, mode }));
    chooseNext({ mode });
  }

  function changeGroups(groups: string[]) {
    if (!groups.length) return;
    setPreferences(value => ({ ...value, groups }));
    chooseNext({ groups });
  }

  function onDrawingChange(strokes: Stroke[]) {
    drawingRevision.current++;
    setStrokeCount(strokes.length);
    setResult(null);
    setCheckError(null);
  }

  function recordOutcome(status: 'correct' | 'incorrect') {
    if (recordedRevision.current === drawingRevision.current) return;
    recordedRevision.current = drawingRevision.current;
    const id = current.id;
    const correct = status === 'correct' ? 1 : 0;
    const day = localDay();
    setProgress(previous => {
      const old = previous.records[id] ?? { attempts: 0, correct: 0 };
      const daily = previous.days[day] ?? { attempts: 0, correct: 0 };
      const streak = correct ? previous.streak + 1 : 0;
      return {
        records: { ...previous.records, [id]: { attempts: old.attempts + 1, correct: old.correct + correct, lastResult: status, lastPracticed: Date.now() } },
        streak,
        bestStreak: Math.max(streak, previous.bestStreak),
        days: { ...previous.days, [day]: { attempts: daily.attempts + 1, correct: daily.correct + correct } },
      };
    });
  }

  async function checkDrawing() {
    if (checking || !recognizer.current || !pad.current || pad.current.isEmpty()) return;
    const image = pad.current.getImageData();
    if (!image) return;
    const token = questionToken.current;
    const revision = drawingRevision.current;
    const generation = ++recognitionGeneration.current;
    const model = recognizer.current;
    setChecking(true);
    setCheckError(null);
    try {
      const response = await model.recognize(image, current.char);
      if (token !== questionToken.current || revision !== drawingRevision.current || generation !== recognitionGeneration.current) return;
      setResult(response);
      if (response.status === 'correct' || response.status === 'incorrect') recordOutcome(response.status);
    } catch {
      // A worker failure still matters after skipping its question. An older
      // request must not, however, invalidate a newer request or reloaded model.
      if (generation === recognitionGeneration.current && recognizer.current === model) {
        recognizer.current = null;
        setModelState('error');
        if (token === questionToken.current) setCheckError('Çizim kontrolü kesintiye uğradı. Yeniden yükle ile kontrolü başlatabilirsin.');
      }
    } finally {
      if (token === questionToken.current && generation === recognitionGeneration.current) setChecking(false);
    }
  }

  function hint() { setShowGuide(value => !value); setUsedHint(true); }
  function showAnimation() { setShowDemo(true); setDemoKey(value => value + 1); setUsedHint(true); }
  function selectCharacter(kana: Kana) {
    if (!preferences.groups.includes(kana.group)) setPreferences(value => ({ ...value, groups: [...value.groups, kana.group] }));
    chooseNext({ specific: kana });
    setModal(null);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (modal || event.defaultPrevented || /INPUT|TEXTAREA|SELECT|BUTTON/.test(target.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        if (result?.status === 'correct') chooseNext(); else void checkDrawing();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const feedback = result?.status === 'correct'
    ? { icon: 'check' as const, title: 'İşte bu!', detail: `${current.char} doğru tanındı.${usedHint ? ' Bir sonraki turda rehbersiz deneyebilirsin.' : ' Hazırsan bir karakter daha.'}` }
    : result?.status === 'incorrect'
      ? { icon: 'retry' as const, title: 'Bir daha deneyelim.', detail: result.predicted ? `Yazdığın karakter ${result.predicted} olarak tanındı. Hedefimiz ${current.char} (${current.romaji}).` : `Hedefimiz ${current.char} (${current.romaji}). Rehberle karşılaştırıp yeniden dene.` }
      : result?.status === 'empty'
        ? { icon: 'pen' as const, title: 'Biraz daha yazalım.', detail: 'Karakteri alanın ortasına, büyük ve belirgin çiz.' }
        : { icon: 'eye' as const, title: 'Emin olamadım.', detail: 'Bu denemeyi yanlış saymadım. Karakteri biraz daha büyük yazabilir veya rehberle karşılaştırabilirsin.' };

  return <div className="app-shell">
    <header className="site-header">
      <a className="brand" href={BASE} aria-label="Hiragana ana sayfa"><span className="brand-seal" lang="ja">ひ</span><span className="brand-wordmark">hiragana<span>.</span><small>YAZARAK ÖĞREN</small></span></a>
      <nav className="header-actions" aria-label="Ana menü">
        <button className="nav-button" onClick={() => setModal('characters')}><Icon name="grid" size={18} /><span>Karakterler</span></button>
        <button className="nav-button help-nav" onClick={() => setModal('help')}><Icon name="help" size={19} /><span>Nasıl çalışır?</span></button>
      </nav>
    </header>

    <main>
      <section className="intro" aria-labelledby="page-title">
        <div className="intro-copy"><p className="eyebrow"><span className="tiny-line" /> KÜÇÜK ÇİZGİLER, YENİ BİR DİL</p><h1 id="page-title">Hadi, bir karakter daha.</h1><p>Kalemini al. Yaz, hatırla, yeniden dene.</p></div>
        <button className="session-stats" onClick={() => setModal('progress')} aria-label="İlerlemeni görüntüle">
          <span className="stat"><span className="stat-value">{today.attempts}<span className="stat-unit">deneme</span></span><span className="stat-label">bugün çalıştın</span></span>
          <span className="stat-divider" />
          <span className="stat"><span className="stat-value streak-value"><Icon name="flame" size={20} />{progress.streak}</span><span className="stat-label">doğru serisi</span></span>
          <Icon name="chevron" className="stats-arrow" size={16} />
        </button>
      </section>

      <div className="practice-layout">
        <aside className="practice-sidebar" aria-label="Alıştırma ayarları ve hedef karakter">
          <div className="mode-section">
            <div className="section-label"><span>01</span><h2>Nasıl çalışalım?</h2></div>
            <div className="mode-tabs" role="group" aria-label="Alıştırma modu">
              <button aria-pressed={preferences.mode === 'copy'} className={preferences.mode === 'copy' ? 'active' : ''} onClick={() => changeMode('copy')}><Icon name="eye" size={18} /><span>Görerek</span></button>
              <button aria-pressed={preferences.mode === 'recall'} className={preferences.mode === 'recall' ? 'active' : ''} onClick={() => changeMode('recall')}><Icon name="book" size={18} /><span>Hatırla</span></button>
              <button aria-pressed={preferences.mode === 'mixed'} className={preferences.mode === 'mixed' ? 'active' : ''} onClick={() => changeMode('mixed')}><Icon name="shuffle" size={18} /><span>Karışık</span></button>
            </div>
          </div>

          <section className="prompt-card" aria-labelledby="prompt-label">
            <div className="prompt-card-top"><span id="prompt-label">{questionMode === 'copy' ? 'BU KARAKTERİ YAZ' : 'HİRAGANASINI HATIRLA'}</span><span className="round-number">{String(round).padStart(2, '0')}</span></div>
            <div className={`prompt-display ${questionMode === 'recall' && !showDemo ? 'romaji-prompt' : ''}`}>
              {showDemo ? <StrokeDemo key={`${current.id}-${demoKey}`} kana={current} /> : questionMode === 'copy' ? <HandwrittenKana kana={current} /> : <span className="prompt-romaji">{current.romaji}</span>}
              <span className="prompt-orbit" aria-hidden="true" />
            </div>
            <div className="prompt-caption">
              <span className="prompt-transcription">{showDemo ? `${current.char} · ${current.romaji}` : questionMode === 'copy' ? current.romaji : 'romaji → hiragana'}</span>
              <p>{questionMode === 'copy' ? 'Karakteri incele, sonra yan tarafa yaz.' : 'Bu okunuşun hiragana karşılığını yaz.'}</p>
            </div>
            <div className="prompt-actions"><button className="text-button" onClick={showAnimation}><Icon name="play" size={15} />{showDemo ? 'Tekrar izle' : 'Çizilişini izle'}</button><button className="text-button muted" onClick={() => chooseNext()}>Atla <Icon name="arrow" size={15} /></button></div>
          </section>

          <section className="set-section" aria-labelledby="set-title">
            <div className="section-label"><span>02</span><h2 id="set-title">Çalışma setin</h2><span className="selection-count">{selectedKana.length} / 46</span></div>
            <div className="set-controls"><button className={`set-choice ${!reviewOnly ? 'active' : ''}`} aria-pressed={!reviewOnly} onClick={() => { setReviewOnly(false); chooseNext({ weak: false }); }}>Seçtiklerim</button><button className={`set-choice ${reviewOnly ? 'active' : ''}`} aria-pressed={reviewOnly} onClick={() => { setReviewOnly(true); chooseNext({ weak: true }); }}>Zorlandıklarım <span>{availableWeak.length}</span></button></div>
            {reviewOnly ? <p className="review-note">{availableWeak.length ? 'Son denemede karıştırdığın karakterler. Doğru yazdıkların bu listeden çıkar.' : 'Şimdilik tekrar bekleyen karakter yok. Seçtiğin gruplardan devam ediyoruz.'}</p> : null}
            <div className="group-chips" role="group" aria-label="Hiragana grupları">
              <button className={`group-chip all-chip ${preferences.groups.length === allGroups.length ? 'selected' : ''}`} aria-pressed={preferences.groups.length === allGroups.length} onClick={() => changeGroups([...allGroups])}>Tümü</button>
              {GROUPS.map(group => <button key={group.id} className={`group-chip ${preferences.groups.includes(group.id) ? 'selected' : ''}`} aria-pressed={preferences.groups.includes(group.id)} disabled={preferences.groups.length === 1 && preferences.groups.includes(group.id)} onClick={() => changeGroups(preferences.groups.includes(group.id) ? preferences.groups.filter(id => id !== group.id) : [...preferences.groups, group.id])}>{group.label}</button>)}
            </div>
            <p className="set-footnote"><Icon name="shuffle" size={14} />Karakterler rastgele sırayla gelir.</p>
          </section>
        </aside>

        <section className="writing-section" aria-labelledby="writing-title">
          <div className="writing-card">
            <div className="writing-card-header"><div className="writing-title-group"><Icon name="pen" size={18} /><h2 id="writing-title">Senin sıran</h2><span className="stroke-counter">{strokeCount ? `${strokeCount} çizgi` : 'Boş sayfa, yeni bir deneme'}</span></div><span className={`model-status ${modelState}`} title={modelState === 'ready' ? 'El yazısı kontrolü bu cihazda çalışıyor' : undefined}><span />{modelState === 'ready' ? 'Kontrol hazır' : modelState === 'loading' ? 'Hazırlanıyor' : 'Yüklenemedi'}</span></div>
            <div className="writing-stage">
              <WritingPad ref={pad} onChange={onDrawingChange} guidePaths={current.strokes} showGuide={showGuide} pencilOnly={preferences.pencilOnly} disabled={checking} />
              {showGuide ? <span className="guide-badge">Yazım rehberi</span> : null}
              {checking ? <div className="checking-overlay" role="status"><span className="spinner" />Çizimin okunuyor…</div> : null}
            </div>
            <div className="pad-toolbar"><div className="drawing-tools"><button className="tool-button" onClick={() => pad.current?.undo()} disabled={!strokeCount || checking} aria-label="Son çizgiyi geri al"><Icon name="undo" size={18} /><span>Geri al</span></button><button className="tool-button" onClick={() => pad.current?.clear()} disabled={!strokeCount || checking}><Icon name="trash" size={18} /><span>Temizle</span></button></div><button className={`tool-button hint-button ${showGuide ? 'selected' : ''}`} onClick={hint} aria-pressed={showGuide}><Icon name="eye" size={18} /><span>Rehber</span></button></div>
          </div>

          <div className="practice-controls"><label className="pencil-switch"><input type="checkbox" checked={preferences.pencilOnly} onChange={event => setPreferences(value => ({ ...value, pencilOnly: event.target.checked }))} /><span className="switch-track" aria-hidden="true"><span /></span><span>Yalnızca Pencil</span><span className="pencil-hint">parmak dokunuşlarını yok say</span></label><span className="hint-state">{usedHint ? <><Icon name="eye" size={13} /> İpuçlu deneme</> : null}</span></div>

          {modelState === 'loading' ? <div className="model-loading" role="status"><div className="model-loading-text"><span>Yazı kontrolü hazırlanıyor. Bu sırada çizmeye başlayabilirsin.</span><span>{Math.round(modelProgress * 100)}%</span></div><div className="loading-track"><span style={{ width: `${Math.max(4, modelProgress * 100)}%` }} /></div></div> : modelState === 'error' ? <div className="model-error" role="alert"><p>Yazı kontrolü yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.</p><button className="text-button" onClick={() => void loadModel()}><Icon name="retry" size={16} /> Yeniden yükle</button></div> : null}

          <div className={`feedback-area ${result ? `feedback-${result.status}` : ''}`} aria-live="polite" aria-atomic="true">
            {result ? <div className="feedback-content"><span className="feedback-icon"><Icon name={feedback.icon} size={22} /></span><div><h3>{feedback.title}</h3><p>{feedback.detail}</p>{result.status === 'uncertain' && result.alternatives.length ? <p className="alternative-list">Yakın eşleşmeler: {result.alternatives.slice(0, 3).map(item => item.char).join(' · ')}</p> : null}</div></div> : checkError ? <div className="check-error" role="alert"><Icon name="retry" size={20} /><p>{checkError}</p></div> : <p className="idle-feedback"><span className="idle-dot" />{questionMode === 'recall' ? 'Aklındaki karakteri çiz. Hazır olduğunda kontrol edelim.' : 'Mükemmel olması gerekmiyor. Okunaklı yazman yeterli.'}</p>}
          </div>

          <div className="submit-row">{result?.status === 'correct' ? <><button className="secondary-button" onClick={() => { pad.current?.clear(); setResult(null); }}>Bir daha yaz</button><button className="primary-button" onClick={() => chooseNext()}>Sıradaki karakter <Icon name="arrow" size={20} /></button></> : <><button className="secondary-button next-button" onClick={() => chooseNext()}>Sonraki <Icon name="arrow" size={18} /></button><button className="primary-button" disabled={!strokeCount || checking || modelState !== 'ready' || (!!result && recordedRevision.current === drawingRevision.current)} onClick={() => void checkDrawing()}>{checking ? <><span className="spinner" />Kontrol ediliyor</> : <><Icon name="check" size={20} />Kontrol et</>}</button></>}</div>
          <p className="privacy-note"><Icon name="shield" size={13} />Çizimlerin cihazından çıkmaz. İlerlemen bu tarayıcıda saklanır.</p>
          {!storageAvailable ? <p className="storage-warning" role="status">Tarayıcı kaydetmeye izin vermiyor. İlerlemen bu oturumdan sonra korunamayabilir.</p> : null}
        </section>
      </div>
    </main>

    <footer className="site-footer"><span><span lang="ja">練習</span> Azar azar, her gün.</span><div><button onClick={() => setModal('help')}>Hakkında & lisanslar</button><a href={repoUrl} target="_blank" rel="noreferrer"><Icon name="github" size={16} />Kaynak kodu</a></div></footer>

    {modal === 'characters' ? <Dialog title="46 karakter, yeni bir alfabe." eyebrow="HİRAGANA TABLOSU" onClose={() => setModal(null)} className="character-modal"><p className="modal-description">Bir karakter seçerek doğrudan çalışmaya başlayabilirsin.</p><div className="kana-reference">{GROUPS.map(group => <div className="kana-reference-row" key={group.id}><span className="kana-row-label">{group.label}</span><div className="kana-row-characters">{KANA.filter(kana => kana.group === group.id).map(kana => <button className={`kana-tile ${kana.id === current.id ? 'current' : ''} ${weakIds.includes(kana.id) ? 'needs-review' : ''}`} key={kana.id} onClick={() => selectCharacter(kana)} aria-label={`${kana.char}, ${kana.romaji}: bu karakteri çalış`}><span lang="ja">{kana.char}</span><small>{kana.romaji}</small>{weakIds.includes(kana.id) ? <i aria-label="Tekrar öneriliyor" /> : null}</button>)}</div></div>)}</div><p className="modal-footnote"><span className="review-dot" /> Turuncu noktalar son denemede karıştırdığın karakterleri gösterir.</p></Dialog> : null}

    {modal === 'help' ? <Dialog title="Kaleminle öğren." eyebrow="KÜÇÜK BİR KULLANIM REHBERİ" onClose={() => setModal(null)} className="help-modal"><div className="help-sections"><section><span className="help-number">01</span><div><h3>Kendi hızında çalış</h3><p><strong>Görerek</strong> modunda karakteri kopyala. <strong>Hatırla</strong> modunda romajinin hiragana karşılığını yaz. <strong>Karışık</strong> modda ikisi rastgele gelir. Çalışmak istediğin harf gruplarını aşağıdan seçebilirsin.</p></div></section><section><span className="help-number">02</span><div><h3>iPad & Apple Pencil</h3><p>Siteyi Safari’de aç. Yazı alanına Pencil ile yazabilir, <strong>Yalnızca Pencil</strong> seçeneğiyle parmak dokunuşlarını yok sayabilirsin. Geri al son çizgiyi siler; Temizle yeni bir deneme açar. Yazarken sayfanın kaymasını önlemek için kalemini kare alanın içinde tut.</p><p>iPad yazını klavye metnine çevirmeye çalışırsa Ayarlar → Apple Pencil içinden <strong>Karalama (Scribble)</strong> özelliğini kapatabilirsin. Safari’nin Paylaş menüsünden <strong>Ana Ekrana Ekle</strong> seçeneğini de kullanabilirsin.</p></div></section><section><span className="help-number">03</span><div><h3>Kontrol neye bakıyor?</h3><p>Bir el yazısı modeli çizdiğin şeklin hangi karakter olduğunu tahmin eder. Karakteri alanın ortasına, büyükçe ve okunaklı yaz. Emin olunamayan denemeler yanlış sayılmaz.</p><p><strong>Çizgi sırası ve kaligrafi tekniği puanlanmaz.</strong> Doğru sırayı öğrenmek için “Çizilişini izle” ve “Rehber” seçeneklerini kullan. Kimi el yazıları yanlış tanınabilir; model kararı tek başına kesin bir öğretmen değerlendirmesi değildir.</p></div></section><section><span className="help-number">04</span><div><h3>Sadece senin cihazında</h3><p>Çizimler analiz için bir sunucuya gönderilmez. İlerleme ve tercihler bu tarayıcıda saklanır; hesap gerekmez. Tarayıcı verilerini silmek ilerlemeyi de siler. Başka cihazlara otomatik aktarılmaz.</p></div></section><section className="credits-section"><span className="help-number"><Icon name="book" size={18} /></span><div><h3>Açık kaynak & teşekkürler</h3><p>Uygulama kodu <a href={`${repoUrl}/blob/main/LICENSE`} target="_blank" rel="noreferrer">MIT</a> lisanslıdır. El yazısı tanıma <a href={`${BASE}licenses/dakanji.txt`} target="_blank" rel="noreferrer">DaKanji</a>, çizim rehberleri <a href={`${BASE}licenses/kanjivg.txt`} target="_blank" rel="noreferrer">KanjiVG</a> ile hazırlanmıştır. Üçüncü taraf varlıkların kendi lisansları geçerlidir.</p><p className="model-attribution">Character recognition powered by machine learning from Dariyooo (DaAppLab).</p><p><a href={`${BASE}licenses/index.txt`} target="_blank" rel="noreferrer">Tüm atıflar ve üçüncü taraf lisansları</a></p><a className="text-button" href={repoUrl} target="_blank" rel="noreferrer"><Icon name="github" size={16} />GitHub’da incele <Icon name="arrow" size={15} /></a></div></section></div></Dialog> : null}

    {modal === 'progress' ? <Dialog title="Her deneme bir adım." eyebrow="SENİN İLERLEMEN" onClose={() => { setModal(null); setConfirmReset(false); }} className="progress-modal"><div className="progress-overview"><div><span>{practicedCount}<small>/ 46</small></span><p>çalışılan karakter</p></div><div><span>{totalAttempts ? `${Math.round(totalCorrect / totalAttempts * 100)}%` : '—'}</span><p>doğru tanınan</p></div><div><span>{progress.bestStreak}</span><p>en iyi doğru serisi</p></div></div><p className="modal-description">Toplam {totalAttempts} değerlendirilen deneme. Emin olunamayan çizimler sayılmaz. İpuçlu denemeler de bu sayılara dahildir.</p><h3 className="progress-grid-title">Karakterlere bir bakış</h3><div className="progress-grid">{KANA.map(kana => { const record = progress.records[kana.id]; return <button key={kana.id} className={`progress-kana ${record ? record.lastResult === 'correct' ? 'practiced' : 'needs-review' : ''}`} onClick={() => selectCharacter(kana)} aria-label={`${kana.char}, ${kana.romaji}: ${record ? `${record.attempts} denemede ${record.correct} doğru` : 'henüz çalışılmadı'}`} title={`${kana.romaji} · ${record ? `${record.correct}/${record.attempts} doğru` : 'henüz çalışılmadı'}`}><span lang="ja">{kana.char}</span><small>{kana.romaji}</small></button>; })}</div><div className="progress-legend"><span><i className="legend-practiced" />Son deneme doğru</span><span><i className="legend-review" />Tekrar et</span><span><i className="legend-unseen" />Henüz çalışılmadı</span></div><div className="reset-progress">{confirmReset ? <><p>Bu tarayıcıdaki tüm çalışma geçmişin silinecek.</p><div><button className="text-button muted" onClick={() => setConfirmReset(false)}>Vazgeç</button><button className="text-button danger-text" onClick={() => { setProgress({ records: {}, streak: 0, bestStreak: 0, days: {} }); setConfirmReset(false); setReviewOnly(false); }}>Evet, geçmişi sıfırla</button></div></> : <button className="text-button muted" onClick={() => setConfirmReset(true)}><Icon name="retry" size={15} />Çalışma geçmişini sıfırla</button>}</div></Dialog> : null}
  </div>;
}
