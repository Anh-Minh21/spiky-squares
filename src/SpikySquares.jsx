import { useEffect, useRef, useState } from 'react'

// ====== constants =================================================
const W = 560, H = 560, PAD = 24
const SIZE_MAX = 76        // kích thước ban đầu
const SIZE_MIN = 18        // kích thước khi gần hết máu (trước khi biến mất)
const SPEED = 200          // px/s
const DMG_PER_SEC = 1500     // sát thương/giây khi chạm gai đúng mặt

// ====== helpers ===================================================
function makeEntity({ x, y, color, spikeColor, spikes }) {
  const angle = Math.random() * Math.PI * 2
  return {
    x, y, w: SIZE_MAX, h: SIZE_MAX,
    vx: Math.cos(angle) * SPEED,
    vy: Math.sin(angle) * SPEED,
    color, spikeColor,
    spikes,          // {left,right,top,bottom} = true/false
    hp: 100, dead:false
  }
}

function overlap(a,b){
  return !(a.x+a.w < b.x || b.x+b.w < a.x || a.y+a.h < b.y || b.y+b.h < a.y)
}

function collisionAxis(a,b){
  const ax=a.x+a.w/2, ay=a.y+a.h/2, bx=b.x+b.w/2, by=b.y+b.h/2
  const dx=ax-bx, dy=ay-by
  const px=(a.w/2+b.w/2)-Math.abs(dx)
  const py=(a.h/2+b.h/2)-Math.abs(dy)
  return px < py ? {axis:'x', normal:Math.sign(dx)} : {axis:'y', normal:Math.sign(dy)}
}

// Vẽ gai to, rõ (tam giác lớn) theo từng cạnh bật true
function drawSpikes(ctx, e){
  ctx.save()
  ctx.fillStyle = e.spikeColor
  const step = 10      // khoảng cách giữa gai
  const tooth = 14     // chiều dài gai

  // TOP
  if (e.spikes.top){
    for (let x=e.x+4; x<e.x+e.w-4; x+=step){
      ctx.beginPath()
      ctx.moveTo(x, e.y)
      ctx.lineTo(x + step/2, e.y - tooth)
      ctx.lineTo(x + step, e.y)
      ctx.closePath(); ctx.fill()
    }
  }
  // BOTTOM
  if (e.spikes.bottom){
    for (let x=e.x+4; x<e.x+e.w-4; x+=step){
      ctx.beginPath()
      ctx.moveTo(x, e.y+e.h)
      ctx.lineTo(x + step/2, e.y+e.h + tooth)
      ctx.lineTo(x + step, e.y+e.h)
      ctx.closePath(); ctx.fill()
    }
  }
  // LEFT
  if (e.spikes.left){
    for (let y=e.y+4; y<e.y+e.h-4; y+=step){
      ctx.beginPath()
      ctx.moveTo(e.x, y)
      ctx.lineTo(e.x - tooth, y + step/2)
      ctx.lineTo(e.x, y + step)
      ctx.closePath(); ctx.fill()
    }
  }
  // RIGHT
  if (e.spikes.right){
    for (let y=e.y+4; y<e.y+e.h-4; y+=step){
      ctx.beginPath()
      ctx.moveTo(e.x+e.w, y)
      ctx.lineTo(e.x+e.w + tooth, y + step/2)
      ctx.lineTo(e.x+e.w, y + step)
      ctx.closePath(); ctx.fill()
    }
  }
  ctx.restore()
}

// ====== component =================================================
export default function SpikySquares(){
  const ref = useRef(null)
  const [paused, setPaused] = useState(false)
  const [seed, setSeed] = useState(0)
  const [hp, setHp] = useState({ red:100, blue:100 })

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')

    // khối ĐỎ: gai 2 bên trái/phải
    const red = makeEntity({
      x: W*0.62 - SIZE_MAX/2, y: H*0.24 - SIZE_MAX/2,
      color:'#ef4444', spikeColor:'#b91c1c',
      spikes:{left:true,right:true,top:false,bottom:false}
    })
    // khối XANH: gai trên/dưới
    const blue = makeEntity({
      x: W*0.32 - SIZE_MAX/2, y: H*0.72 - SIZE_MAX/2,
      color:'#3b82f6', spikeColor:'#1d4ed8',
      spikes:{left:false,right:false,top:true,bottom:true}
    })

    function clamp(e){
      const minX=PAD, minY=PAD, maxX=W-PAD-e.w, maxY=H-PAD-e.h
      if(e.x<minX){e.x=minX; e.vx=Math.abs(e.vx)}
      if(e.x>maxX){e.x=maxX; e.vx=-Math.abs(e.vx)}
      if(e.y<minY){e.y=minY; e.vy=Math.abs(e.vy)}
      if(e.y>maxY){e.y=maxY; e.vy=-Math.abs(e.vy)}
    }

    // Thu nhỏ theo %HP (giữ tâm để không “nhảy”)
    function applyShrink(e){
      const centerX = e.x + e.w/2
      const centerY = e.y + e.h/2
      const k = e.hp <= 0 ? 0 : (SIZE_MIN + (SIZE_MAX - SIZE_MIN) * (e.hp/100))
      e.w = e.h = Math.max(0, k)
      e.x = centerX - e.w/2
      e.y = centerY - e.h/2
    }

    function damage(def, amount){ if(!def.dead){ def.hp = Math.max(0, def.hp-amount); if(def.hp<=0){ def.dead = true } } }

    // Kiểm tra đúng “gai chạm mặt không có gai”
    function applySpikeDamage(a, aSide, b, bSide, dt){
      const aHas = a.spikes[aSide]
      const bHas = b.spikes[bSide]
      if (aHas && !bHas) damage(b, DMG_PER_SEC*dt)
    }

    function resolve(a,b,dt){
      if (a.dead || b.dead) return
      if (!overlap(a,b)) return

      const {axis, normal} = collisionAxis(a,b)

      if (axis === 'x'){
        // mặt chạm nhau: (normal=1) => a.left vs b.right; (normal=-1) => a.right vs b.left
        const aSide = normal === 1 ? 'left' : 'right'
        const bSide = normal === 1 ? 'right' : 'left'
        applySpikeDamage(a, aSide, b, bSide, dt)
        applySpikeDamage(b, bSide, a, aSide, dt) // chiều ngược lại

        // tách & nảy
        const o=(a.w/2+b.w/2)-Math.abs(a.x+a.w/2-(b.x+b.w/2))
        const sep=o/2+0.5; a.x+=normal*sep; b.x-=normal*sep; a.vx=-a.vx; b.vx=-b.vx
      } else {
        // (normal=1) => a.top vs b.bottom; (normal=-1) => a.bottom vs b.top
        const aSide = normal === 1 ? 'top' : 'bottom'
        const bSide = normal === 1 ? 'bottom' : 'top'
        applySpikeDamage(a, aSide, b, bSide, dt)
        applySpikeDamage(b, bSide, a, aSide, dt)

        const o=(a.h/2+b.h/2)-Math.abs(a.y+a.h/2-(b.y+b.h/2))
        const sep=o/2+0.5; a.y+=normal*sep; b.y-=normal*sep; a.vy=-a.vy; b.vy=-b.vy
      }
    }

    function drawEntity(e){
      if (e.dead) return
      ctx.fillStyle = e.color
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'
      ctx.lineWidth = 3
      ctx.fillRect(e.x, e.y, e.w, e.h)
      ctx.strokeRect(e.x, e.y, e.w, e.h)
      drawSpikes(ctx, e)
    }

    let last=0, raf, accum=0
    function loop(ts){
      raf = requestAnimationFrame(loop)
      if (paused){ last = ts; return }
      if (!last) last = ts
      const dt = (ts - last) / 1000
      last = ts

      // update
      if(!red.dead){ red.x += red.vx*dt; red.y += red.vy*dt; clamp(red) }
      if(!blue.dead){ blue.x += blue.vx*dt; blue.y += blue.vy*dt; clamp(blue) }

      resolve(red, blue, dt)

      applyShrink(red)
      applyShrink(blue)

      // draw
      ctx.clearRect(0,0,W,H)
      ctx.fillStyle = '#0f0f10'
      ctx.fillRect(0,0,W,H)
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4
      ctx.strokeRect(PAD, PAD, W-PAD*2, H-PAD*2)
      drawEntity(red); drawEntity(blue)

      // cập nhật thanh máu thưa để mượt
      accum += dt
      if (accum > 0.06){
        accum = 0
        setHp(h => (h.red!==red.hp || h.blue!==blue.hp) ? { red:+red.hp.toFixed(1), blue:+blue.hp.toFixed(1) } : h)
      }
    }
    raf = requestAnimationFrame(loop)
    return ()=>cancelAnimationFrame(raf)
  }, [paused, seed])

  // UI
  const redPct  = Math.max(0, Math.min(100, hp.red))
  const bluePct = Math.max(0, Math.min(100, hp.blue))

  return (
    <div className="text-white">
      {/* thanh máu */}
      <div className="flex gap-6 w-full justify-between max-w-[620px] mx-auto mb-3">
        <div className="flex-1">
          <div className="text-sm mb-1">Red</div>
          <div className="h-3 bg-neutral-700 rounded overflow-hidden">
            <div className="h-3 bg-red-500" style={{width:`${redPct}%`}} />
          </div>
        </div>
        <div className="flex-1">
          <div className="text-sm mb-1 text-right">Blue</div>
          <div className="h-3 bg-neutral-700 rounded overflow-hidden">
            <div className="h-3 bg-blue-500 ml-auto" style={{width:`${bluePct}%`}} />
          </div>
        </div>
      </div>

      {/* canvas + control */}
      <div className="flex flex-col items-center gap-3">
        <canvas ref={ref} width={W} height={H} className="bg-neutral-800 rounded shadow-2xl" />
        <div className="flex gap-3">
          <button onClick={()=>setPaused(p=>!p)} className="px-3 py-1 rounded bg-white/10 hover:bg-white/20">
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button onClick={()=>setSeed(s=>s+1)} className="px-3 py-1 rounded bg-white/10 hover:bg-white/20">
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
