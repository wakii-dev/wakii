import { translate } from '@/i18n/i18n'
import {
  NATIVE_CHAT_ORCA_STOP_COPY as COPY,
  type NativeChatOrcaStopCopyId,
  type NativeChatOrcaStopSay
} from '../../../../shared/native-chat/native-chat-orca-stop-words'

const PIECES: Record<NativeChatOrcaStopCopyId, (machine: string | undefined) => string> = {
  update: (machine) =>
    translate('components.native-chat.notices.wakiiStopUpdate', COPY.update, { machine }),
  quit: (machine) =>
    translate('components.native-chat.notices.wakiiStopQuit', COPY.quit, { machine }),
  crash: (machine) =>
    translate('components.native-chat.notices.wakiiStopCrash', COPY.crash, { machine }),
  remote: (machine) =>
    translate('components.native-chat.notices.wakiiStopRemote', COPY.remote, { machine }),
  canContinue: () =>
    translate('components.native-chat.notices.wakiiStopCanContinue', COPY.canContinue),
  unnamedServer: () =>
    translate('components.native-chat.notices.wakiiStopUnnamedServer', COPY.unnamedServer)
}

export const sayNativeChatOrcaStopTranslated: NativeChatOrcaStopSay = (id, machine) =>
  PIECES[id](machine)
