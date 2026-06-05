import { useCallback, useReducer } from "react"
import { nanoid } from "nanoid"
import {
  EndScreenElement,
  EndScreenElementType,
  ELEMENT_DEFAULTS,
  TemplateElement,
} from "./types"

interface HistoryState {
  past: EndScreenElement[][]
  present: EndScreenElement[]
  future: EndScreenElement[][]
}

type HistoryAction =
  | { type: "COMMIT"; elements: EndScreenElement[] }
  | { type: "PATCH"; id: string; patch: Partial<EndScreenElement> }
  | { type: "UNDO" }
  | { type: "REDO" }

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "COMMIT": {
      return {
        past: [...state.past, state.present],
        present: action.elements,
        future: [],
      }
    }
    case "PATCH": {
      return {
        ...state,
        present: state.present.map((el) =>
          el.id === action.id ? { ...el, ...action.patch } : el
        ),
      }
    }
    case "UNDO": {
      if (state.past.length === 0) return state
      const previous = state.past[state.past.length - 1]
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      }
    }
    case "REDO": {
      if (state.future.length === 0) return state
      const next = state.future[0]
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      }
    }
    default:
      return state
  }
}

export function useEndScreen(initialElements: EndScreenElement[] = []) {
  const [state, dispatch] = useReducer(historyReducer, {
    past: [],
    present: initialElements,
    future: [],
  })

  const elements = [...state.present].sort((a, b) => a.startTime - b.startTime)

  const undo = useCallback(() => dispatch({ type: "UNDO" }), [])
  const redo = useCallback(() => dispatch({ type: "REDO" }), [])

  const commit = useCallback(() => {
    dispatch({ type: "COMMIT", elements: state.present })
  }, [state.present])

  const canUndo = state.past.length > 0
  const canRedo = state.future.length > 0

  const addElement = useCallback(
    (type: EndScreenElementType, duration: number): string => {
      if (state.present.length >= 4) return ""

      const id = nanoid()
      const defaults = ELEMENT_DEFAULTS[type]
      const startTime = Math.max(0, duration - 20)
      const endTime = duration

      let x = 55
      let y = 58

      if (type === "subscribe" || type === "channel") {
        x = 5
        y = 55
      } else if (type === "link") {
        x = 5
        y = 70
      }

      const newElement: EndScreenElement = {
        id,
        type,
        x,
        y,
        width: defaults.width,
        height: defaults.height,
        startTime,
        endTime,
      }

      const newElements = [...state.present, newElement]
      dispatch({ type: "COMMIT", elements: newElements })
      return id
    },
    [state.present]
  )

  const deleteElement = useCallback(
    (id: string) => {
      const newElements = state.present.filter((el) => el.id !== id)
      dispatch({ type: "COMMIT", elements: newElements })
    },
    [state.present]
  )

  const patchElement = useCallback((id: string, patch: Partial<EndScreenElement>) => {
    dispatch({ type: "PATCH", id, patch })
  }, [])

  const commitPatch = useCallback(
    (id: string, patch: Partial<EndScreenElement>) => {
      const newElements = state.present.map((el) =>
        el.id === id ? { ...el, ...patch } : el
      )
      dispatch({ type: "COMMIT", elements: newElements })
    },
    [state.present]
  )

  const applyTemplate = useCallback(
    (template: TemplateElement[], duration: number) => {
      const startTime = Math.max(0, duration - 20)
      const newElements: EndScreenElement[] = template.map((tpl) => ({
        id: nanoid(),
        type: tpl.type,
        x: tpl.x,
        y: tpl.y,
        width: tpl.width,
        height: tpl.height,
        startTime,
        endTime: duration,
      }))
      dispatch({ type: "COMMIT", elements: newElements })
    },
    []
  )

  return {
    elements,
    undo,
    redo,
    commit,
    canUndo,
    canRedo,
    addElement,
    deleteElement,
    patchElement,
    commitPatch,
    applyTemplate,
  }
}
