import { useEffect, useState } from 'react'
import type { ChoreRecord } from './api/chores'
import ChoreForm from './components/ChoreForm'
import Dashboard from './components/Dashboard'
import PresetPicker from './components/PresetPicker'
import type { PresetItem } from './api/presets'
import { useToday } from './lib/useToday'

/**
 * 추가 흐름: 대시보드 → 기본 목록 선택(pick) → 추가 폼(add).
 * takenNames는 대시보드에 있던 집안일 이름으로, 선택 화면의 "추가됨" 표시에 쓴다. 폼에서 취소하면 선택 화면으로 돌아간다.
 */
type Screen =
  | { kind: 'dashboard' }
  | { kind: 'pick'; takenNames: string[] }
  | { kind: 'add'; takenNames: string[]; preset?: PresetItem }
  | { kind: 'edit'; chore: ChoreRecord }

interface AppProps {
  /** 오늘 날짜 "YYYY-MM-DD". 테스트에서 고정할 때 쓴다. 없으면 기기 로컬 날짜를 쓰고 날짜가 바뀌면 갱신한다. */
  today?: string
}

/** 화면이 몇 개뿐이므로 라우터 없이 상태로 전환한다. 대시보드로 돌아오면 다시 마운트되어 목록을 새로 불러온다. */
function App({ today }: AppProps) {
  const [screen, setScreen] = useState<Screen>({ kind: 'dashboard' })
  const liveToday = useToday()
  const currentToday = today ?? liveToday
  const goDashboard = () => setScreen({ kind: 'dashboard' })

  // 화면이 바뀌면 맨 위부터 보이게 한다. 선택 화면을 스크롤해 고른 뒤 폼이 중간부터 보이지 않도록.
  useEffect(() => {
    window.scrollTo?.(0, 0)
  }, [screen.kind])

  return (
    <div className="app">
      {screen.kind === 'dashboard' && (
        <Dashboard
          today={currentToday}
          onAdd={(takenNames) => setScreen({ kind: 'pick', takenNames })}
          onEdit={(chore) => setScreen({ kind: 'edit', chore })}
        />
      )}
      {screen.kind === 'pick' && (
        <PresetPicker
          takenNames={screen.takenNames}
          onPick={(preset) => setScreen({ kind: 'add', takenNames: screen.takenNames, preset })}
          onCustom={() => setScreen({ kind: 'add', takenNames: screen.takenNames })}
          onClose={goDashboard}
        />
      )}
      {screen.kind === 'add' && (
        <ChoreForm
          preset={screen.preset}
          today={currentToday}
          onDone={goDashboard}
          onCancel={() => setScreen({ kind: 'pick', takenNames: screen.takenNames })}
        />
      )}
      {screen.kind === 'edit' && (
        <ChoreForm
          key={screen.chore.id}
          chore={screen.chore}
          today={currentToday}
          onDone={goDashboard}
          onCancel={goDashboard}
        />
      )}
    </div>
  )
}

export default App
