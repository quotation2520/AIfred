import { registerSW } from 'virtual:pwa-register'
import { UpdateScheduler, watchForUpdates } from './lib/appUpdate'

/**
 * 서비스 워커를 등록하고, 새 버전이 오면 안전한 순간에 반영한다(lib/appUpdate.ts).
 *
 * - onNeedRefresh: 새 서비스 워커가 설치되어 기다린다 → 안전할 때 updateSW()로 교체한다.
 * - onNeedReload: 새 서비스 워커가 이 화면을 맡았다 → 새로고침한다. 우리가 교체를 시작했으면
 *   방금 안전을 확인했으므로 바로 하고, 다른 탭이 교체했으면 안전한 순간을 기다린다.
 * 서비스 워커는 HTTPS(또는 localhost)에서만 동작한다. 개발 서버(npm run dev)에서는 아무 일도 하지 않는다.
 */
export function registerAppUpdate(): void {
  let swapping = false
  let swapScheduler: UpdateScheduler | null = null
  let reloadScheduler: UpdateScheduler | null = null
  const reload = () => window.location.reload()

  const updateSW = registerSW({
    onNeedRefresh() {
      swapScheduler ??= new UpdateScheduler({
        apply: () => {
          swapping = true
          void updateSW()
        },
      })
      swapScheduler.markReady()
    },
    onNeedReload() {
      if (swapping) {
        reload()
        return
      }
      reloadScheduler ??= new UpdateScheduler({ apply: reload })
      reloadScheduler.markReady()
    },
    onRegisteredSW(_url, registration) {
      if (registration) watchForUpdates(registration)
    },
  })
}
