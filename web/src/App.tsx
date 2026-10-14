import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChoreRecord } from './api/chores'
import ChoreForm, { DISCARD_CONFIRM_TEXT } from './components/ChoreForm'
import Dashboard, { type DashboardHandle } from './components/Dashboard'
import PresetPicker from './components/PresetPicker'
import Sheet from './components/Sheet'
import { HistoryStack } from './lib/historyStack'
import { canAnimateExit } from './lib/motion'
import { ADD_FORM_HASH, DASHBOARD_HASH, editHash, isSheetRoute, parseHash, PICK_HASH, type Route } from './lib/routes'
import { HistoryStackContext, useBackLayer } from './lib/useBackLayer'
import { useChores } from './lib/useChores'
import { useToday } from './lib/useToday'

interface AppProps {
  /** 오늘 날짜 "YYYY-MM-DD". 테스트에서 고정할 때 쓴다. 없으면 기기 로컬 날짜를 쓰고 날짜가 바뀌면 갱신한다. */
  today?: string
}

const DASHBOARD: Route = { kind: 'dashboard' }

/**
 * 대시보드 위에 추가·편집 시트를 띄운다 (UX R5). 라우터 없이 주소 해시와 방문 기록으로 화면을 오간다(lib/routes.ts).
 *
 * 추가: "+" → 기본 목록(#/add) → 추가 폼(#/add/form). 폼 취소는 기본 목록으로, 닫기·바깥 탭은 대시보드로 간다.
 * 편집: 카드 → 편집 폼(#/edit/<id>). 없는 id면(새로고침 등) 대시보드로 간다.
 * 뒤로 가기는 가장 위에 열린 것 하나를 닫는다 (UX U3, lib/historyStack.ts). 입력이 바뀌었으면 먼저 버릴지 묻는다.
 * 저장하면 시트를 닫고 그 기록도 걷어 내서, 대시보드에서 뒤로 가기를 눌러도 폼이 다시 열리지 않는다.
 *
 * 대시보드는 시트 뒤에 그대로 있다(스크롤 위치 유지). 목록은 처음에 한 번 불러오고, 저장·삭제 응답으로 고친다.
 */
function App({ today }: AppProps) {
  const liveToday = useToday()
  const currentToday = today ?? liveToday
  const store = useChores()
  const [stack] = useState(() => new HistoryStack(window, DASHBOARD_HASH))
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  const routeRef = useRef(route)
  // 닫히는 움직임 동안 시트 안에 남겨 둘 화면
  const [exiting, setExiting] = useState<Route | null>(null)
  // 시트 안 입력이 처음 값과 달라졌는지(추가·편집 폼, 기본 목록의 작은 입력 폼)
  const dirty = useRef(false)
  const dashboard = useRef<DashboardHandle>(null)

  // 방문 기록 관리는 층을 쌓는 아래 훅들보다 먼저 시작한다(같은 컴포넌트의 효과는 선언 순서로 돈다).
  useEffect(() => stack.start(), [stack])

  const go = useCallback((next: Route) => {
    const previous = routeRef.current
    routeRef.current = next
    if (isSheetRoute(previous) && !isSheetRoute(next) && canAnimateExit()) setExiting(previous)
    else if (isSheetRoute(next)) setExiting(null)
    setRoute(next)
  }, [])

  const setDirty = useCallback((value: boolean) => {
    dirty.current = value
  }, [])

  /** 입력이 바뀌었으면 버릴지 묻는다. 버려도 되면 true */
  const confirmDiscard = () => !dirty.current || window.confirm(DISCARD_CONFIRM_TEXT)

  /** 시트 전체 닫기: 닫기(✕), 바깥 탭, 아래로 끌기 */
  const requestClose = () => {
    if (confirmDiscard()) go(DASHBOARD)
  }

  // 방문 기록의 층. 기본 목록은 추가 폼 아래에 깔려 있어서, 폼에서 뒤로 가면 기본 목록으로 돌아간다.
  useBackLayer(route.kind === 'pick' || route.kind === 'add', () => go(DASHBOARD), { stack, hash: PICK_HASH })
  useBackLayer(
    route.kind === 'add',
    () => {
      if (!confirmDiscard()) return false
      go({ kind: 'pick' })
    },
    { stack, hash: ADD_FORM_HASH },
  )
  useBackLayer(
    route.kind === 'edit',
    () => {
      if (!confirmDiscard()) return false
      go(DASHBOARD)
    },
    { stack, hash: route.kind === 'edit' ? editHash(route.id) : undefined },
  )

  const chores = store.state.kind === 'ready' ? store.state.chores : []
  const findChore = (id: string) => chores.find((chore) => chore.id === id)
  const editTarget = route.kind === 'edit' ? findChore(route.id) : undefined

  // 주소의 id가 없거나 삭제된 집안일이면(새로고침, 오래된 기록) 대시보드로 간다.
  const editMissing =
    route.kind === 'edit' &&
    (store.state.kind === 'error' || (store.state.kind === 'ready' && (!editTarget || editTarget.deletedAt != null)))
  useEffect(() => {
    if (editMissing) go(DASHBOARD)
  }, [editMissing, go])

  const takenNames = chores.filter((chore) => chore.deletedAt == null).map((chore) => chore.name)

  const handleSaved = (saved: ChoreRecord | null) => {
    if (saved) store.upsert(saved)
    go(DASHBOARD)
  }

  const renderContent = (shown: Route) => {
    switch (shown.kind) {
      case 'pick':
        return (
          <PresetPicker
            takenNames={takenNames}
            onPick={(preset) => go({ kind: 'add', preset })}
            onCustom={() => go({ kind: 'add' })}
            onClose={requestClose}
            onDirtyChange={setDirty}
          />
        )
      case 'add':
        return (
          <ChoreForm
            key="add"
            preset={shown.preset}
            today={currentToday}
            onSaved={handleSaved}
            onCancel={() => go({ kind: 'pick' })}
            onClose={requestClose}
            onDirtyChange={setDirty}
          />
        )
      case 'edit': {
        const chore = findChore(shown.id)
        if (!chore) return null
        return (
          <ChoreForm
            key={chore.id}
            chore={chore}
            today={currentToday}
            onSaved={handleSaved}
            onCancel={() => go(DASHBOARD)}
            onClose={requestClose}
            onDelete={(target) => {
              go(DASHBOARD)
              dashboard.current?.deleteChore(target)
            }}
            onDirtyChange={setDirty}
          />
        )
      }
      case 'dashboard':
        return null
    }
  }

  // 편집은 집안일을 찾은 뒤에 연다(불러오는 중에는 시트를 띄우지 않는다).
  const sheetRoute = isSheetRoute(route) && !(route.kind === 'edit' && !editTarget) ? route : null
  const shown = sheetRoute ?? exiting
  const content = shown && renderContent(shown)

  return (
    <HistoryStackContext.Provider value={stack}>
      <div className="app" inert={sheetRoute !== null || undefined}>
        <Dashboard
          ref={dashboard}
          today={currentToday}
          store={store}
          onAdd={() => go({ kind: 'pick' })}
          onEdit={(chore) => go({ kind: 'edit', id: chore.id })}
        />
      </div>
      {shown && content && (
        <Sheet
          closing={sheetRoute === null}
          onExited={() => setExiting(null)}
          onRequestClose={requestClose}
          onEscape={() => stack.back()}
          testId="sheet"
        >
          {content}
        </Sheet>
      )}
    </HistoryStackContext.Provider>
  )
}

export default App
