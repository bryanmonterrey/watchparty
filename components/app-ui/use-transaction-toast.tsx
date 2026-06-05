import { toast } from 'sonner'
import { ExplorerLink } from '@/components/cluster/cluster-ui'

export function useTransactionToast() {
  return (signature: string) => {
    toast('Transaction sent', {
      description: <ExplorerLink path={`tx/${signature}`} label="View Transaction" />,
    })
  }
}
