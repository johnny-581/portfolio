import { useEffect, useRef, type RefObject } from 'react'
import { mount } from '../toy/index.ts'

interface Props {
  /** The page headline: items may slide under it, but never land centered on it. */
  headlineRef?: RefObject<HTMLElement | null>
}

/** The grocery bag toy. React only owns the container; the toy manages its own DOM. */
export default function GroceryBag({ headlineRef }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const debug = new URLSearchParams(location.search).has('debug')
    const seed = new URLSearchParams(location.search).get('seed')
    return mount(stageRef.current!, {
      artBase: `${import.meta.env.BASE_URL}art/`,
      headline: headlineRef?.current ?? null,
      debug,
      seed: seed ? Number(seed) : undefined,
    })
  }, [headlineRef])

  return (
    <div className="toy-stage" ref={stageRef} aria-hidden="true">
      <div className="bag-anchor" />
    </div>
  )
}
