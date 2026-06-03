import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import {
  fetchActivePlatformPolicies,
  fetchOrganizerPlatformPolicies,
} from '@/services/platformFinance.js'

const policyLabels = {
  REFUND: 'Refund',
  PAYOUT: 'Payout',
  EVENT_APPROVAL: 'Event approval',
  SERVICE_FEE: 'Service fee',
  ORGANIZER_REGULATION: 'Organizer regulation',
}

export function PlatformPoliciesPage({ audience = 'public' }) {
  const policiesQuery = useQuery({
    queryKey: ['active-platform-policies', audience],
    queryFn: () =>
      audience === 'organizer'
        ? fetchOrganizerPlatformPolicies()
        : fetchActivePlatformPolicies(),
  })

  const policies = policiesQuery.data || []

  return (
    <div className={audience === 'organizer' ? '' : 'mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8'}>
      <div className="mb-6">
        <p className="text-xs font-bold uppercase text-primary">Platform policy</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold text-[#111827]">
          Active policies
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#434655]">
          Current business rules and PDF policy documents published by EventHub.
        </p>
      </div>

      {policiesQuery.isLoading && (
        <PolicyPanel>
          <p className="text-sm font-semibold text-[#434655]">Loading policies...</p>
        </PolicyPanel>
      )}

      {policiesQuery.isError && (
        <PolicyPanel>
          <p className="text-sm font-semibold text-error">Cannot load active policies.</p>
        </PolicyPanel>
      )}

      {!policiesQuery.isLoading && policies.length === 0 && (
        <PolicyPanel>
          <p className="text-sm font-semibold text-[#434655]">No active policies are published.</p>
        </PolicyPanel>
      )}

      <div className="grid gap-4">
        {policies.map((policy) => (
          <PolicyPanel key={policy.id}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <span className="inline-flex rounded bg-[#dbe1ff] px-2 py-1 text-xs font-bold uppercase text-[#003ea8]">
                  {policyLabels[policy.policy_type] || policy.policy_type}
                </span>
                <h2 className="mt-3 text-xl font-extrabold text-[#111827]">{policy.title}</h2>
                {policy.description && (
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#434655]">
                    {policy.description}
                  </p>
                )}
              </div>
              <p className="text-xs font-semibold text-[#737686]">
                Effective from {policy.effective_from ? new Date(policy.effective_from).toLocaleDateString('vi-VN') : 'now'}
              </p>
            </div>

            {Object.keys(policy.config || {}).length > 0 && (
              <pre className="mt-4 overflow-x-auto rounded-md bg-[#f2f4f6] p-3 text-xs text-[#191c1e]">
                {JSON.stringify(policy.config, null, 2)}
              </pre>
            )}

            <div className="mt-4 flex flex-wrap gap-3">
              {(policy.documents || []).map((document) => (
                <a
                  key={document.id}
                  href={document.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-[#c3c6d7] px-3 py-2 text-sm font-bold text-primary transition hover:bg-[#f1fbff]"
                >
                  <FileText className="size-4" />
                  {document.title}
                </a>
              ))}
            </div>
          </PolicyPanel>
        ))}
      </div>
    </div>
  )
}

function PolicyPanel({ children }) {
  return (
    <section className="rounded-md border border-[#c3c6d7] bg-white p-5 shadow-sm">
      {children}
    </section>
  )
}
