/**
 * Monaco Editor 本地化引导
 *
 * `@monaco-editor/react` 默认通过 CDN（jsdelivr）异步加载 Monaco 资源包，
 * 离线或网络不稳定时会一直停留在 "Loading…" 占位态。这里改用项目已有的
 * `monaco-editor` npm 包自托管，并只注册应用实际用到的 pgsql 语言，
 * 避免引入全量语言包（`monaco-editor` 根导出会预注册数十种语言）。
 */
import * as monaco from 'monaco-editor/editor/editor.api'
import { loader } from '@monaco-editor/react'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'

import 'monaco-editor/languages/definitions/pgsql/register'

self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker()
  }
}

loader.config({ monaco })
