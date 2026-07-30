'use client'
import { useEffect, useRef, useState } from 'react'

/* ════════════════════════════════════════════════════════════════════════════
   PhysicsBoxes — exact Matter.js physics from source
   Mouse impulse, scroll-to-grid snap, proximity repulsion
   ════════════════════════════════════════════════════════════════════════════ */

interface Card {
  name: string
  desc: string
  accent?: boolean
}

const CARDS: Card[] = [
  { name: 'ChatGPT', desc: 'نوشتن، تحلیل و کدنویسی روزمره', accent: true },
  { name: 'Claude', desc: 'متن‌های بلند و مرور کد' },
  { name: 'Gemini', desc: 'پردازش هم‌زمان متن و تصویر' },
  { name: 'Midjourney', desc: 'تصویرسازی و کانسپت بصری' },
  { name: 'DALL·E', desc: 'تصویر از توضیح متنی' },
  { name: 'Perplexity', desc: 'جست‌وجوی ارجاع‌دار' },
]

const MAX_SPEED = 22
const PROXIMITY = 120

export default function PhysicsBoxes() {
  const stageRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const [staticLayout, setStaticLayout] = useState(false)

  useEffect(() => {
    let destroyed = false
    const stage = stageRef.current!
    if (!stage) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      setStaticLayout(true)
      return
    }

    const loadMatter = async () => {
      const Matter = (window as any).Matter
      if (!Matter) {
        console.warn('Matter.js not loaded')
        setStaticLayout(true)
        return
      }

      const { Engine, Runner, Bodies, Body, Composite, Mouse, MouseConstraint, Events } = Matter

      let width = stage.clientWidth
      let height = stage.clientHeight

      const engine = Engine.create()
      engine.gravity.y = 0.6
      engine.positionIterations = 8
      engine.velocityIterations = 8

      const world = engine.world

      const WALL = 200
      let walls: any[] = []
      function buildWalls() {
        Composite.remove(world, walls)
        // Cards spawn above the stage (negative Y, down to roughly -h*5) and
        // fall in under gravity. The ceiling therefore has to sit above every
        // spawn point — at the old -WALL/2 it sealed the stage shut and the
        // cards hung above the section forever instead of dropping in.
        const CEILING = -1600
        walls = [
          Bodies.rectangle(width / 2, CEILING - WALL / 2, width + WALL * 2, WALL, { isStatic: true }),
          Bodies.rectangle(width / 2, height + WALL / 2, width + WALL * 2, WALL, { isStatic: true }),
          Bodies.rectangle(-WALL / 2, height / 2, WALL, (height - CEILING) + WALL * 2, { isStatic: true }),
          Bodies.rectangle(width + WALL / 2, height / 2, WALL, (height - CEILING) + WALL * 2, { isStatic: true })
        ]
        Composite.add(world, walls)
      }
      buildWalls()

      const entries = cardRefs.current.map((el, i) => {
        if (!el) return null
        const w = el.offsetWidth
        const h = el.offsetHeight
        const body = Bodies.rectangle(
          width * (0.2 + Math.random() * 0.6),
          -h * (1.4 + i * 0.9),
          w,
          h,
          {
            restitution: 0.34,
            friction: 0.22,
            frictionAir: 0.016,
            density: 0.0016,
            chamfer: { radius: 18 }
          }
        )
        Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.16)
        return { el, body, w, h, slot: { x: 0, y: 0 } }
      }).filter(Boolean) as any[]

      if (!entries.length) return

      Composite.add(world, entries.map((e: any) => e.body))

      function computeSlots() {
        const cols = width < 720 ? 2 : 3
        const rows = Math.ceil(entries.length / cols)
        const cellW = width / cols
        const cellH = height / rows
        entries.forEach((e: any, i: number) => {
          const c = i % cols
          const r = Math.floor(i / cols)
          e.slot.x = width - (c * cellW + cellW / 2)
          e.slot.y = r * cellH + cellH / 2
        })
      }
      computeSlots()

      const mouse = Mouse.create(stage)
      mouse.pixelRatio = window.devicePixelRatio || 1
      const mouseConstraint = MouseConstraint.create(engine, {
        mouse,
        constraint: { stiffness: 0.14, render: { visible: false } }
      })
      Composite.add(world, mouseConstraint)
      stage.removeEventListener('wheel', (mouse as any).mousewheel)

      const cursor = { x: -9999, y: -9999, px: -9999, py: -9999, vx: 0, vy: 0 }
      function onMove(e: PointerEvent) {
        const rect = stage.getBoundingClientRect()
        cursor.px = cursor.x
        cursor.py = cursor.y
        cursor.x = e.clientX - rect.left
        cursor.y = e.clientY - rect.top
        cursor.vx = cursor.x - cursor.px
        cursor.vy = cursor.y - cursor.py
      }
      function onLeave() {
        cursor.x = -9999
        cursor.y = -9999
        cursor.vx = 0
        cursor.vy = 0
      }
      stage.addEventListener('pointermove', onMove, { passive: true })
      stage.addEventListener('pointerleave', onLeave, { passive: true })

      let progress = 0
      let frozen = false

      function applyCursorImpulse() {
        if (cursor.x < -1000) return
        const speed = Math.hypot(cursor.vx, cursor.vy)
        if (speed < 0.4) return
        const scale = Math.min(speed, 60) * 0.0000024
        for (const e of entries) {
          if (e.body.isStatic) continue
          const dx = e.body.position.x - cursor.x
          const dy = e.body.position.y - cursor.y
          const d = Math.hypot(dx, dy)
          if (d > PROXIMITY || d < 0.001) continue
          const falloff = 1 - d / PROXIMITY
          Body.applyForce(e.body, e.body.position, {
            x: cursor.vx * scale * falloff * e.body.mass,
            y: cursor.vy * scale * falloff * e.body.mass
          })
        }
      }

      function clampVelocities() {
        for (const e of entries) {
          if (e.body.isStatic) continue
          const v = e.body.velocity
          const s = Math.hypot(v.x, v.y)
          if (s > MAX_SPEED) {
            Body.setVelocity(e.body, { x: (v.x / s) * MAX_SPEED, y: (v.y / s) * MAX_SPEED })
          }
          if (Math.abs(e.body.angularVelocity) > 0.5) {
            Body.setAngularVelocity(e.body, Math.sign(e.body.angularVelocity) * 0.5)
          }
        }
      }

      function pullTowardGrid() {
        if (progress <= 0.02) return
        const t = Math.max(0, Math.min(1, (progress - 0.02) / 0.93))
        const lerp = 0.02 + Math.pow(t, 2.1) * 0.36
        for (const e of entries) {
          if (e.body.isStatic) continue
          Body.setPosition(e.body, {
            x: e.body.position.x + (e.slot.x - e.body.position.x) * lerp,
            y: e.body.position.y + (e.slot.y - e.body.position.y) * lerp
          })
          Body.setAngle(e.body, e.body.angle + (0 - e.body.angle) * lerp)
          Body.setVelocity(e.body, { x: e.body.velocity.x * (1 - lerp), y: e.body.velocity.y * (1 - lerp) })
          Body.setAngularVelocity(e.body, e.body.angularVelocity * (1 - lerp))
        }
      }

      function freeze() {
        if (frozen) return
        frozen = true
        for (const e of entries) {
          Body.setPosition(e.body, { x: e.slot.x, y: e.slot.y })
          Body.setAngle(e.body, 0)
          Body.setVelocity(e.body, { x: 0, y: 0 })
          Body.setAngularVelocity(e.body, 0)
          Body.setStatic(e.body, true)
          e.el.classList.add('is-settled')
        }
      }

      function unfreeze() {
        if (!frozen) return
        frozen = false
        for (const e of entries) {
          Body.setStatic(e.body, false)
          e.el.classList.remove('is-settled')
        }
      }

      Events.on(engine, 'beforeUpdate', () => {
        applyCursorImpulse()
        pullTowardGrid()
        clampVelocities()
      })

      Events.on(engine, 'afterUpdate', render)

      function render() {
        for (const e of entries) {
          const { x, y } = e.body.position
          e.el.style.transform =
            `translate3d(${x - e.w / 2}px, ${y - e.h / 2}px, 0) rotate(${e.body.angle}rad)`
        }
      }

      const gsap = (await import('gsap')).default
      const { ScrollTrigger } = await import('gsap/ScrollTrigger')
      gsap.registerPlugin(ScrollTrigger)

      const trigger = ScrollTrigger.create({
        trigger: stage,
        start: 'top top',
        end: '+=90%',
        pin: true,
        scrub: 1.1,
        onUpdate(self: any) {
          progress = self.progress
          if (progress >= 0.95) freeze()
          else unfreeze()
        },
        onRefreshInit() {
          width = stage.clientWidth
          height = stage.clientHeight
          buildWalls()
          computeSlots()
          entries.forEach((e: any) => {
            e.w = e.el.offsetWidth
            e.h = e.el.offsetHeight
          })
        }
      })

      const runner = Runner.create({ isFixed: true, delta: 1000 / 60 })
      Runner.run(runner, engine)

      function onResize() {
        width = stage.clientWidth
        height = stage.clientHeight
        buildWalls()
        computeSlots()
        if (frozen) {
          entries.forEach((e: any) => Body.setPosition(e.body, { x: e.slot.x, y: e.slot.y }))
          render()
        }
      }
      window.addEventListener('resize', onResize)

      return () => {
        destroyed = true
        window.removeEventListener('resize', onResize)
        stage.removeEventListener('pointermove', onMove)
        stage.removeEventListener('pointerleave', onLeave)
        trigger.kill()
        Runner.stop(runner)
        Events.off(engine)
        Composite.clear(world, false)
        Engine.clear(engine)
      }
    }

    loadMatter()

    return () => { destroyed = true }
  }, [])

  return (
    <section className="motion-section motion-section-alt">
      <div className="motion-section-inner">
        <span className="motion-eyebrow">مدل‌ها</span>
        <h2 className="motion-section-title">پراکنده،<br />تا وقتی نظم پیدا کنند</h2>
        <p className="motion-section-sub">
          کارت‌ها را جابجا کنید. با اسکرول سر جای خود می‌نشینند —
          همان کاری که یک پنل با ابزارهای پراکنده شما می‌کند.
        </p>

        <div
          ref={stageRef}
          className={`cards-stage ${staticLayout ? 'is-static' : ''}`}
          style={{ touchAction: 'pan-y' }}
        >
          {CARDS.map((card, i) => (
            <div
              key={card.name}
              ref={(el) => { cardRefs.current[i] = el }}
              className={`card ${card.accent ? 'is-accent' : ''}`}
            >
              <div className="card-rule" />
              <h3 className="card-name">{card.name}</h3>
              <p className="card-role">{card.desc}</p>
            </div>
          ))}
        </div>
        <p className="stage-hint">برای مرتب شدن کارت‌ها اسکرول کنید.</p>
      </div>
    </section>
  )
}
