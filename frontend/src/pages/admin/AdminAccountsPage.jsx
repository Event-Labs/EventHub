import {
  Actions,
  Badge,
  FilterBar,
  KpiGrid,
  Page,
  Status,
  Table,
  UserCell,
} from './AdminComponents.jsx'

export function AdminAccountsPage() {
  const users = [
    {
      name: 'Sarah Jenkins',
      email: 'sarah.j@example.com',
      role: 'Admin',
      status: 'Active',
      provider: 'Google SSO',
      createdDate: 'Oct 12, 2023',
      avatarUrl: null,
    },
    {
      name: 'Marcus Knight',
      email: 'm.knight@outlook.com',
      role: 'Customer',
      status: 'Locked',
      provider: 'Email/Pass',
      createdDate: 'Nov 02, 2023',
      avatarUrl: null,
    },
    {
      name: 'Elena Vance',
      email: 'elena@vance.media',
      role: 'Organizer',
      status: 'Pending',
      provider: 'Microsoft SSO',
      createdDate: 'Dec 20, 2023',
      avatarUrl: null,
    },
  ]

  return (
    <Page
      title="Account Management"
      description="Oversee system access, user roles, and security status."
      action="Create New Account"
    >
      <KpiGrid
        items={[
          ['Total Users', '12,842', '+4.2%'],
          ['Active Now', '1,204', ''],
          ['Pending Verification', '84', ''],
          ['Locked Accounts', '12', ''],
        ]}
      />
      <FilterBar labels={['All Roles', 'Any Status', 'All Methods']} />
      <Table
        headers={['User', 'Role', 'Status', 'Login Provider', 'Created Date', 'Actions']}
        rows={users.map((user) => [
          <UserCell
            key="user"
            name={user.name}
            email={user.email}
            image={user.avatarUrl}
          />,
          <Badge key="role" tone={user.role === 'Organizer' ? 'purple' : 'blue'}>
            {user.role}
          </Badge>,
          <Status key="status" value={user.status} />,
          user.provider,
          user.createdDate,
          <Actions key="actions" locked={user.status === 'Locked'} />,
        ])}
      />
    </Page>
  )
}
