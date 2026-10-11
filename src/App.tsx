import { useRef } from 'react'
import GroceryBag from './components/GroceryBag.tsx'
import './App.css'

export default function App() {
  const headlineRef = useRef<HTMLHeadingElement>(null)
  return (
    <>
      <main className="hero">
        <header className="site-header">
          <a className="site-name" href="/">
            Johnny Dong
          </a>
          <nav className="site-nav">
            <a href="/">home</a>
            <a href="#about">about</a>
          </nav>
        </header>
        <GroceryBag headlineRef={headlineRef} />
        <h1 className="headline" ref={headlineRef}>
          A curious design engineer
        </h1>
      </main>
      <section className="below" id="about">
        <p>Work goes here.</p>
      </section>
    </>
  )
}
