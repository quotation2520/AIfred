import { useState } from 'react'
import type { ChoreRecord } from './api/chores'
import ChoreForm from './components/ChoreForm'
import Dashboard from './components/Dashboard'
import { useToday } from './lib/useToday'

type Screen = { kind: 'dashboard' } | { kind: 'add' } | { kind: 'edit'; chore: ChoreRecord }

interface AppProps {
  /** 오늘 날짜 "YYYY-MM-DD". 테스트에서 고정할 때 쓴다. 없으면 기기 로컬 날짜를 쓰고 날짜가 바뀌면 갱신한다. */
  today?: string
}

/** 화면이 2개뿐이므로 라우터 없이 상태로 전환한다. 대시보드로 돌아오면 다시 마운트되어 목록을 새로 불러온다. */
function App({ today }: AppProps) {
  const [screen, setScreen] = useState<Screen>({ kind: 'dashboard' })
  const liveToday = useToday()
  const currentToday = today ?? liveToday
  const goDashboard = () => setScreen({ kind: 'dashboard' })

  return (
    <div className="app">
      {screen.kind === 'dashboard' && (
        <Dashboard
          today={currentToday}
          onAdd={() => setScreen({ kind: 'add' })}
          onEdit={(chore) => setScreen({ kind: 'edit', chore })}
        />
      )}
      {screen.kind === 'add' && <ChoreForm today={currentToday} onDone={goDashboard} onCancel={goDashboard} />}
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
