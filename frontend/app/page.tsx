'use client'

import { useState, useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import VortexBackground from '@/components/VortexBackground'
import WaterTrailBackground from '@/components/WaterTrailBackground'
import MeshGradientBackground from '@/components/MeshGradientBackground'
import PhysicsBoxes from '@/components/PhysicsBoxes'
import { LanguageToggle } from '@/components/LanguageToggle'
import './motion-effects.css'

/* ════════════════════════════════════════════════════════════════════════════
   MultiAI — پلتفرم هوش مصنوعی (فارسی)
   ════════════════════════════════════════════════════════════════════════════ */

const MODELS = ['GPT-4o', 'Claude 3.5', 'Gemini Pro', 'DeepSeek V3', 'Llama 3.1', 'Mistral Large', 'Qwen 2.5', 'Command R+']

const FEATURES = [
  { icon: '✦', title: 'چت چندمدلی', desc: 'بین GPT-4، Claude، Gemini در وسط مکالمه جابجا شوید. بهترین مدل برای هر وظیفه.' },
  { icon: '◈', title: 'عامل‌های هوش مصنوعی', desc: 'عامل‌های خودمختار هوش مصنوعی با مهارت‌ها، حافظه و ابزارهای دلخواه بسازید و مستقر کنید.' },
  { icon: '⇄', title: 'مقایسه هوشمند', desc: 'مقایسه کنار هم مدل‌ها روی یک پرامپت. کیفیت، سرعت و هزینه را ببینید.' },
  { icon: '▣', title: 'هوش سند', desc: 'PDF و اسناد را آپلود کنید — هوش مصنوعی می‌خواند، درک می‌کند و پاسخ می‌دهد.' },
  { icon: '⌘', title: 'API باز', desc: 'endpoint‌های REST سازگار با OpenAI. جایگزین مستقیم برای یکپارچه‌سازی‌های موجود.' },
  { icon: '◌', title: 'داشبورد مصرف', desc: 'مصرف توکن بلادرنگ، ردیابی هزینه و صورتحساب. بدون سورپرایز در صورتحساب.' },
]

const CODE_TABS: Record<string, string> = {
  Python: `import openai\n\nclient = openai.OpenAI(\n    base_url="https://api.multiai.ir/v1",\n    api_key="your-api-key"\n)\n\nresponse = client.chat.completions.create(\n    model="gpt-4o",\n    messages=[\n        {"role": "user", "content": "سلام!"}\n    ]\n)\nprint(response.choices[0].message.content)`,
  cURL: `curl https://api.multiai.ir/v1/chat/completions \\\n  -H "Authorization: Bearer ***" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "gpt-4o",\n    "messages": [\n      {"role": "user", "content": "سلام!"}\n    ]\n  }'`,
  JavaScript: `const response = await fetch(\n  "https://api.multiai.ir/v1/chat/completions",\n  {\n    method: "POST",\n    headers: {\n      "Authorization": "Bearer ***",\n      "Content-Type": "application/json"\n    },\n    body: JSON.stringify({\n      model: "gpt-4o",\n      messages: [{ role: "user", content: "سلام!" }]\n    })\n  }\n)\nconst data = await response.json()\nconsole.log(data.choices[0].message.content)`,
}

const PRICING_PLANS = [
  { name: 'رایگان', price: '۰', period: '/رایگان', features: ['۳ مدل', '۱۰۰ پیام در روز', 'داشبورد پایه', 'پشتیبانی جامعه'], cta: 'شروع رایگان' },
  { name: 'حرفه‌ای', price: '۱۹', period: '/ماه', features: ['همه ۲۰+ مدل', 'پیام نامحدود', 'عامل‌های هوش مصنوعی', 'دسترسی API', 'پشتیبانی اولویت‌دار'], cta: 'ارتقا به حرفه‌ای', highlighted: true },
  { name: 'سازمانی', price: 'سفارشی', period: '', features: ['instanc‌های اختصاصی', 'مدل‌های دلخواه', 'تضمین SLA', 'SSO و RBAC', 'پشتیبانی اختصاصی'], cta: 'تماس با فروش' },
]

const FAQ = [
  { q: 'چه مدل‌هایی موجود است؟', a: 'GPT-4o، GPT-4 Turbo، Claude 3.5 Sonnet، Gemini Pro، DeepSeek V3، Llama 3.1، Mistral Large، Qwen 2.5، Command R+ و ۱۰+ مدل دیگر. هر هفته مدل جدید اضافه می‌شود.' },
  { q: 'آیا پلن رایگان وجود دارد؟', a: 'بله. رایگان و برای همیشه با ۱۰۰ پیام در روز روی ۳ مدل. نیازی به کارت اعتباری نیست. هر زمان ارتقا دهید.' },
  { q: 'API چگونه کار می‌کند؟', a: 'API REST سازگار با OpenAI. base_url را به api.multiai.ir/v1 تغییر دهید و از کلید MultiAI خود استفاده کنید. با SDK‌های موجود OpenAI کار می‌کند.' },
  { q: 'آیا می‌توانم عامل هوش مصنوعی بسازم؟', a: 'بله. پلن حرفه‌ای شامل سازنده عامل با مهارت‌ها، حافظه، استفاده از ابزار و اجرای خودمختار است.' },
  { q: 'آیا داده‌های من خصوصی هستند؟', a: 'ما روی داده‌های شما آموزش نمی‌دهیم. مکالمات رمزگذاری شده هستند. پلن سازمانی شامل instanc‌های اختصاصی با جداسازی کامل داده است.' },
]

/* ════════════════════════════════════════════════════════════════════════════
   Motion Effects — GSAP
   ════════════════════════════════════════════════════════════════════════════ */

function MotionEffects() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    gsap.registerPlugin(ScrollTrigger)

    // All tweens/ScrollTriggers below are scoped to this context so ctx.revert()
    // can fully undo them on cleanup — including plain (non-scrollTrigger) .from()
    // tweens, which React 18 StrictMode's mount→unmount→mount dev cycle would
    // otherwise leave stuck at their "from" state (e.g. an invisible hero).
    const ctx = gsap.context(() => {
      // Hero camera progress → vortex
      gsap.to({}, {
        scrollTrigger: {
          trigger: '.motion-hero',
          start: 'top top',
          end: 'bottom top',
          scrub: 1,
          onUpdate: (self: any) => {
            const p = self.progress
            document.documentElement.style.setProperty('--scroll-progress', String(p))
            if ((window as any).motionVortex) (window as any).motionVortex.setProgress(p)
          },
        },
      })

      // Hero content stagger entrance (RTL-aware)
      gsap.from('.motion-hero-content > *', {
        y: 50, opacity: 0, duration: 1, stagger: 0.15,
        ease: 'power3.out', delay: 0.4,
      })

      // Sections reveal
      document.querySelectorAll('.motion-section').forEach((el) => {
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: 'top 88%' },
          y: 50, opacity: 0, scale: 0.98, duration: 0.9, ease: 'power2.out',
        })
      })

      // Feature cards stagger
      document.querySelectorAll('.motion-feature-card').forEach((el, i) => {
        gsap.from(el, {
          scrollTrigger: { trigger: el.closest('.motion-features-grid'), start: 'top 85%' },
          y: 30, opacity: 0, delay: i * 0.08, duration: 0.7, ease: 'power2.out',
        })
      })

      // Stats count-up
      document.querySelectorAll('.motion-stat-num').forEach((el) => {
        const text = el.textContent
        const target = parseFloat(text?.replace(/[^0-9.]/g, '') || '0') || 0
        const suffix = text?.replace(/[0-9.]/g, '') || ''
        gsap.from(el, {
          scrollTrigger: { trigger: el.closest('.motion-stats'), start: 'top 85%' },
          textContent: 0, duration: 1.2, ease: 'power2.out', snap: { textContent: 1 },
          modifiers: {
            textContent: (v: number) => {
              const n = Math.round(v * target)
              return n >= 1000 ? `${(n / 1000).toFixed(1)}k${suffix}` : `${n}${suffix}`
            },
          },
        })
      })

      // Pricing cards scale-in
      document.querySelectorAll('.motion-pricing-card').forEach((el, i) => {
        gsap.from(el, {
          scrollTrigger: { trigger: el.closest('.motion-pricing-grid'), start: 'top 85%' },
          y: 30, opacity: 0, scale: 0.95, delay: i * 0.1, duration: 0.7, ease: 'power2.out',
        })
      })

      // Scroll progress line
      ScrollTrigger.create({
        trigger: document.body,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          document.documentElement.style.setProperty('--scroll-progress', String(self.progress))
        },
      })

      ScrollTrigger.refresh()
    })

    // Pointer parallax (desktop only) — plain DOM listener, not a GSAP tween
    const hero = document.querySelector('.motion-hero') as HTMLElement | null
    const onPointerMove = (e: PointerEvent) => {
      if (!hero || !matchMedia('(hover: hover) and (pointer: fine)').matches) return
      const x = (e.clientX / window.innerWidth - 0.5) * 2
      const y = (e.clientY / window.innerHeight - 0.5) * 2
      hero.style.setProperty('--pointer-x', `${x * 12}px`)
      hero.style.setProperty('--pointer-y', `${y * 8}px`)
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      ctx.revert()
    }
  }, [])

  return null
}

/* ════════════════════════════════════════════════════════════════════════════
   Components
   ════════════════════════════════════════════════════════════════════════════ */

/* ── Nav ────────────────────────────────────────────────────────────────── */
function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <nav className={`motion-nav${scrolled ? ' motion-nav--scrolled' : ''}`} role="navigation" aria-label="ناوبری اصلی">
      <div className="motion-nav-inner">
        <a href="/signup" className="motion-nav-logo" aria-label="خانه MultiAI">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4h6v6H4V4zm0 10h6v6H4v-6zm10-10h6v6h-6V4zm3 10h3v6h-3v-6z" fill="currentColor"/>
          </svg>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>MultiAI</span>
        </a>
        <div className="motion-nav-center">
          <a href="/models">مدل‌ها</a>
          <a href="/chat">چت</a>
          <a href="/skills">عامل‌ها</a>
          <a href="/pricing">تعرفه‌ها</a>
          <a href="/developer">مستندات API</a>
        </div>
        <div className="motion-nav-right">
          <LanguageToggle />
          <a href="/login" className="motion-nav-link">ورود</a>
          <a href="/signup" className="motion-nav-cta">شروع رایگان</a>
        </div>
      </div>
    </nav>
  )
}

/* ── Hero ────────────────────────────────────────────────────────────────── */
function Hero() {
  const [model, setModel] = useState('هر مدل هوش مصنوعی')
  useEffect(() => {
    const models = ['هر مدل هوش مصنوعی', 'GPT-4o', 'Claude', 'Gemini', 'DeepSeek', 'Llama']
    let idx = 0
    const timer = window.setInterval(() => {
      idx = (idx + 1) % models.length
      setModel(models[idx])
    }, 2800)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <section className="motion-hero">
      <MeshGradientBackground variant={0} />
      <MeshGradientBackground variant={1} />
      <VortexBackground />
      <WaterTrailBackground />
      <div className="motion-hero-content">
        <a href="/signup" className="motion-hero-pill">
          ⚡ پلن رایگان موجود — نیازی به کارت اعتباری نیست
        </a>
        <h1>
          یک پلتفرم.<br />
          <span className="hero-model-word" aria-live="polite" aria-atomic="true">{model}</span>
        </h1>
        <p className="motion-hero-sub">
          با GPT-4، Claude، Gemini، DeepSeek و ۲۰+ مدل دیگر چت کنید.<br />
          عامل‌های هوش مصنوعی بسازید. مهارت‌ها را مستقر کنید. یک کلید API.
        </p>
        <div className="motion-hero-actions">
          <a href="/signup" className="motion-btn motion-btn-primary">شروع رایگان</a>
          <a href="/models" className="motion-btn motion-btn-ghost">مشاهده همه مدل‌ها ←</a>
        </div>
      </div>
      <div className="motion-hero-strip">
        <div className="motion-strip-track">
          {[...MODELS, ...MODELS].map((m, i) => (
            <div key={i} className="motion-strip-chip">
              <span style={{ opacity: 0.9 }}>{m}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Features Grid ──────────────────────────────────────────────────────── */
function FeaturesGrid() {
  return (
    <section className="motion-section">
      <div className="motion-section-inner">
        <span className="motion-eyebrow">امکانات پلتفرم</span>
        <h2 className="motion-section-title">هر آنچه نیاز دارید،<br />هیچ چیز اضافی نیست.</h2>
        <p className="motion-section-sub">
          یک فضای کاری برای هر مدل هوش مصنوعی. چت، ساخت عامل، مقایسه خروجی، مدیریت API — همه در یک مکان.
        </p>
        <div className="motion-features-grid">
          {FEATURES.map((f, i) => (
            <article key={i} className="motion-feature-card">
              <div className="motion-feature-icon" aria-hidden="true">{f.icon}</div>
              <h3 className="motion-feature-title">{f.title}</h3>
              <p className="motion-feature-desc">{f.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Code Demo ──────────────────────────────────────────────────────────── */
function CodeDemo() {
  const [tab, setTab] = useState('Python')
  return (
    <section className="motion-section motion-section-alt">
      <div className="motion-section-inner">
        <div className="motion-builder">
          <div className="motion-builder-text">
            <span className="motion-eyebrow">API سازگار با OpenAI</span>
            <h3>یک endpoint.<br />هر مدل.</h3>
            <p className="motion-builder-p">
              base_url را به api.multiai.ir/v1 تغییر دهید. همین. با SDK‌های موجود OpenAI کار می‌کند — بدون نیاز به تغییر کد.
            </p>
            <a href="/developer" className="motion-btn motion-btn-ghost" style={{ marginTop: '0.5rem' }}>مشاهده مستندات API ←</a>
          </div>
          <div className="motion-builder-visual">
            <div className="motion-code-block">
              <div className="motion-code-tabs">
                {Object.keys(CODE_TABS).map(name => (
                  <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>
                    {name}
                  </button>
                ))}
              </div>
              <pre key={tab} style={{ fontSize: '0.75rem', lineHeight: 1.6 }}>{CODE_TABS[tab]}</pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Stats ──────────────────────────────────────────────────────────────── */
function Stats() {
  return (
    <div className="motion-stats">
      {[
        { num: '۲۰+', label: 'مدل هوش مصنوعی' },
        { num: '۱۰k', label: 'کاربر' },
        { num: '۹۹.۹%', label: 'آپتایم' },
        { num: '۰$', label: 'شروع رایگان' },
      ].map((s, i) => (
        <div key={i} className="motion-stat">
          <div className="motion-stat-num">{s.num}</div>
          <div className="motion-stat-label">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

/* ── Pricing ────────────────────────────────────────────────────────────── */
function PricingSection() {
  return (
    <section id="pricing" className="motion-section motion-section-alt">
      <div className="motion-section-inner">
        <span className="motion-eyebrow">تعرفه‌ها</span>
        <h2 className="motion-section-title">قیمت‌گذاری ساده و شفاف</h2>
        <p className="motion-section-sub">رایگان شروع کنید. فقط برای آنچه استفاده می‌کنید بپردازید.</p>
        <div className="motion-pricing-grid">
          {PRICING_PLANS.map((plan) => (
            <article key={plan.name} className={`motion-pricing-card${plan.highlighted ? ' highlighted' : ''}`}>
              <h3>{plan.name}</h3>
              <div className="motion-pricing-price">
                <span>{plan.price}</span>
                <span className="motion-pricing-period">{plan.period}</span>
              </div>
              <ul className="motion-pricing-features">
                {plan.features.map((f, idx) => (
                  <li key={idx}>✓ {f}</li>
                ))}
              </ul>
              <a href={plan.name === 'سازمانی' ? '/profile' : '/signup'} className={`motion-btn ${plan.highlighted ? 'motion-btn-primary' : 'motion-btn-ghost'}`} style={{ marginTop: '1rem', width: '100%', justifyContent: 'center' }}>
                {plan.cta}
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── FAQ ────────────────────────────────────────────────────────────────── */
function FAQSection() {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section className="motion-section motion-faq-section">
      <div className="motion-section-inner">
        <span className="motion-eyebrow">سوالات متداول</span>
        <h2 className="motion-section-title">سوالات پرتکرار</h2>
        <dl className="motion-faq">
          {FAQ.map((item, i) => (
            <div key={i} className="motion-faq-item">
              <dt>
                <button
                  type="button"
                  className="motion-faq-trigger"
                  aria-expanded={open === i}
                  aria-controls={`faq-answer-${i}`}
                  onClick={() => setOpen(open === i ? null : i)}
                >
                  {item.q}
                  <span aria-hidden="true" style={{ transition: 'transform 0.2s', transform: open === i ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
                </button>
              </dt>
              {open === i && <dd id={`faq-answer-${i}`} role="region">{item.a}</dd>}
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

/* ── CTA ────────────────────────────────────────────────────────────────── */
function CTASection() {
  return (
    <section className="motion-section motion-cta-section">
      <div className="motion-section-inner">
        <div className="motion-cta-box">
          <h2 className="motion-section-title">همین الان شروع کنید</h2>
          <p className="motion-section-sub">
            به هزاران کاربری بپیوندید که از MultiAI برای چت، ساخت عامل و توسعه استفاده می‌کنند.
          </p>
          <div className="motion-cta-actions">
            <a href="/signup" className="motion-btn motion-btn-primary motion-btn-lg">ساخت حساب رایگان</a>
            <a href="/developer" className="motion-btn motion-btn-ghost motion-btn-lg">مشاهده مستندات ←</a>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Footer ──────────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="motion-footer">
      <div className="motion-section-inner">
        <div className="motion-footer-links">
          <div>
            <h4>پلتفرم</h4>
            <a href="/models">مدل‌ها</a>
            <a href="/chat">چت</a>
            <a href="/skills">عامل‌های هوش مصنوعی</a>
            <a href="/pricing">تعرفه‌ها</a>
          </div>
          <div>
            <h4>توسعه‌دهندگان</h4>
            <a href="/developer">مستندات API</a>
            <a href="/api-keys">کلیدهای API</a>
            <a href="/compare">مقایسه مدل‌ها</a>
          </div>
          <div>
            <h4>شرکت</h4>
            <a href="/profile">پروفایل</a>
            <a href="/referral">دعوت دوستان</a>
            <a href="#">حریم خصوصی</a>
            <a href="#">شرایط استفاده</a>
          </div>
        </div>
        <div className="motion-footer-bottom">
          © ۲۰۲۵ MultiAI. تمامی حقوق محفوظ است.
        </div>
      </div>
    </footer>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   Page
   ════════════════════════════════════════════════════════════════════════════ */

export default function LandingPage() {
  return (
    <div dir="rtl" lang="fa" style={{ fontFamily: "'Vazirmatn', 'Freigeist', sans-serif" }}>
      <MotionEffects />
      <Nav />
      <Hero />
      <PhysicsBoxes />
      <FeaturesGrid />
      <CodeDemo />
      <Stats />
      <PricingSection />
      <CTASection />
      <FAQSection />
      <Footer />
    </div>
  )
}