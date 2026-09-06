import { describe, expect, it } from 'vitest'
import { locationScore, suggestMoves } from '../moves'

describe('locationScore', () => {
  it('ranks a spot by its platsklass', () => {
    expect(locationScore('A', 'vanlig')).toBe(3)
    expect(locationScore('B', 'vanlig')).toBe(2)
    expect(locationScore('C', 'vanlig')).toBe(1)
  })

  it('lifts a tunnel and holds back the stations that want few lines', () => {
    expect(locationScore('B', 'tunnel')).toBe(3)
    expect(locationScore('B', 'vagnsplock')).toBe(1)
    expect(locationScore('B', 'temperatur')).toBe(1)
  })

  it('puts a tunnel C-plats level with an ordinary B-plats', () => {
    expect(locationScore('C', 'tunnel')).toBe(locationScore('B', 'vanlig'))
  })

  it('excludes A-Frame entirely', () => {
    expect(locationScore('A', 'aframe')).toBeNull()
  })
})

describe('suggestMoves', () => {
  const scores = new Map([
    ['GOOD', 3],
    ['OK', 2],
    ['BAD', 1],
    ['GOOD-2', 3],
  ])

  it('swaps the biggest mover in a poor spot with the smallest one in a good spot', () => {
    const suggestions = suggestMoves({
      placed: [
        { itemId: 'RUNNER', plats: 'BAD', volume: 500 },
        { itemId: 'SLEEPER', plats: 'GOOD', volume: 10 },
      ],
      emptyLocations: [],
      scoreByPlats: scores,
      limit: 10,
    })
    expect(suggestions).toEqual([
      {
        kind: 'swap',
        itemId: 'RUNNER',
        fromPlats: 'BAD',
        toPlats: 'GOOD',
        swapWithItemId: 'SLEEPER',
        gain: (500 - 10) * 2,
      },
    ])
  })

  it('prefers an empty better spot over displacing someone, when it is worth more', () => {
    const suggestions = suggestMoves({
      placed: [
        { itemId: 'RUNNER', plats: 'BAD', volume: 500 },
        { itemId: 'SLEEPER', plats: 'OK', volume: 400 },
      ],
      emptyLocations: ['GOOD'],
      scoreByPlats: scores,
      limit: 10,
    })
    expect(suggestions[0]).toMatchObject({ kind: 'move', itemId: 'RUNNER', toPlats: 'GOOD', gain: 500 * 2 })
  })

  it('suggests nothing when everything already sits where it should', () => {
    const suggestions = suggestMoves({
      placed: [
        { itemId: 'RUNNER', plats: 'GOOD', volume: 500 },
        { itemId: 'SLEEPER', plats: 'BAD', volume: 10 },
      ],
      emptyLocations: [],
      scoreByPlats: scores,
      limit: 10,
    })
    expect(suggestions).toEqual([])
  })

  it('never suggests a swap that gains nothing', () => {
    // Same volume, so trading them moves picks around for no benefit.
    const suggestions = suggestMoves({
      placed: [
        { itemId: 'A', plats: 'BAD', volume: 100 },
        { itemId: 'B', plats: 'GOOD', volume: 100 },
      ],
      emptyLocations: [],
      scoreByPlats: scores,
      limit: 10,
    })
    expect(suggestions).toEqual([])
  })

  it('leaves out locations with no score, so A-Frame is never touched', () => {
    const suggestions = suggestMoves({
      placed: [
        { itemId: 'RUNNER', plats: 'AFRAME', volume: 900 },
        { itemId: 'SLEEPER', plats: 'GOOD', volume: 1 },
      ],
      emptyLocations: ['AFRAME-EMPTY'],
      scoreByPlats: scores,
      limit: 10,
    })
    expect(suggestions).toEqual([])
  })

  it('uses each article and each location at most once, so the list can be worked in any order', () => {
    const suggestions = suggestMoves({
      placed: [
        { itemId: 'R1', plats: 'BAD', volume: 500 },
        { itemId: 'R2', plats: 'BAD-2', volume: 400 },
        { itemId: 'S1', plats: 'GOOD', volume: 5 },
        { itemId: 'S2', plats: 'GOOD-2', volume: 6 },
      ],
      emptyLocations: [],
      scoreByPlats: new Map([...scores, ['BAD-2', 1]]),
      limit: 10,
    })
    const items = suggestions.flatMap((s) => [s.itemId, s.swapWithItemId]).filter(Boolean)
    const platser = suggestions.flatMap((s) => [s.fromPlats, s.toPlats])
    expect(new Set(items).size).toBe(items.length)
    expect(new Set(platser).size).toBe(platser.length)
  })

  it('returns the best suggestions first and honours the limit', () => {
    const suggestions = suggestMoves({
      placed: [
        { itemId: 'R1', plats: 'BAD', volume: 500 },
        { itemId: 'R2', plats: 'BAD-2', volume: 100 },
        { itemId: 'S1', plats: 'GOOD', volume: 5 },
        { itemId: 'S2', plats: 'GOOD-2', volume: 6 },
      ],
      emptyLocations: [],
      scoreByPlats: new Map([...scores, ['BAD-2', 1]]),
      limit: 1,
    })
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].itemId).toBe('R1')
  })
})
