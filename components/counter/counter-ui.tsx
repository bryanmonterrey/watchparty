'use client'

import { Keypair, PublicKey } from '@solana/web3.js'
import { useMemo } from 'react'
import { ellipsify } from '@/lib/utils'
import { ExplorerLink } from '../cluster/cluster-ui'
import { useCounterProgram, useCounterProgramAccount } from './counter-data-access'
import { Button } from '../ui/button'

export function CounterCreate() {
  const { initialize } = useCounterProgram()

  return (
    <Button
      className="btn btn-xs lg:btn-md btn-primary"
      onClick={() => initialize.mutateAsync(Keypair.generate())}
      disabled={initialize.isPending}
    >
      Create {initialize.isPending && '...'}
    </Button>
  )
}

export function CounterList() {
  const { accounts, getProgramAccount } = useCounterProgram()

  if (getProgramAccount.isLoading) {
    return <span className="loading loading-spinner loading-lg"></span>
  }
  if (!getProgramAccount.data?.value) {
    return (
      <div className="alert alert-info flex justify-center">
        <span>Program account not found. Make sure you have deployed the program and are on the correct cluster.</span>
      </div>
    )
  }
  return (
    <div className={'space-y-6'}>
      {accounts.isLoading ? (
        <span className="loading loading-spinner loading-lg"></span>
      ) : accounts.data?.length ? (
        <div className="grid md:grid-cols-2 gap-4">
          {accounts.data?.map((account: any) => (
            <CounterCard key={account.publicKey.toString()} account={account.publicKey} />
          ))}
        </div>
      ) : (
        <div className="text-center">
          <h2 className={'text-2xl'}>No accounts</h2>
          No accounts found. Create one above to get started.
        </div>
      )}
    </div>
  )
}

export function CounterCard({ account }: { account: PublicKey }) {
  const { accountQuery, increment, decrement, set, close } = useCounterProgramAccount({
    account,
  })

  const count = useMemo(() => accountQuery.data?.count ?? 0, [accountQuery.data?.count])

  return accountQuery.isLoading ? (
    <span className="loading loading-spinner loading-lg"></span>
  ) : (
    <div className="card card-bordered border-base-300 border-4 text-neutral-content">
      <div className="card-body items-center text-center">
        <div className="space-y-6">
          <h2 className="card-title justify-center text-3xl cursor-pointer" onClick={() => accountQuery.refetch()}>
            {count}
          </h2>
          <div className="card-actions justify-around">
            <Button
              className="btn btn-xs lg:btn-md btn-outline"
              onClick={() => increment.mutateAsync()}
              disabled={increment.isPending}
            >
              Increment
            </Button>
            <Button
              className="btn btn-xs lg:btn-md btn-outline"
              onClick={() => {
                const value = window.prompt('Set value to:', count.toString())
                if (!value || parseInt(value) === count || isNaN(parseInt(value))) {
                  return
                }
                return set.mutateAsync(parseInt(value))
              }}
              disabled={set.isPending}
            >
              Set
            </Button>
            <Button
              className="btn btn-xs lg:btn-md btn-outline"
              onClick={() => decrement.mutateAsync()}
              disabled={decrement.isPending}
            >
              Decrement
            </Button>
          </div>
          <div className="text-center space-y-4">
            <p>
              <ExplorerLink path={`account/${account}`} label={ellipsify(account.toString())} />
            </p>
            <Button
              className="btn btn-xs btn-secondary btn-outline"
              onClick={() => {
                if (!window.confirm('Are you sure you want to close this account?')) {
                  return
                }
                return close.mutateAsync()
              }}
              disabled={close.isPending}
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
