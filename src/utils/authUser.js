export function isAuthTestUser(user) {
  return Boolean(user?.isTestUser)
}

export function isAuthAdmin(user) {
  return user?.isAdmin === 1
}
