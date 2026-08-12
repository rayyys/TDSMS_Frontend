import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { AUTH_STORAGE_KEY } from '@/constants/storageKeys'
import { readAuthSession, writeAuthSession } from '@/utils/authSession'
import { isAuthTestUser, isAuthAdmin } from '@/utils/authUser'

export const useAuthStore = defineStore('auth', () => {
  const userData = ref(readAuthSession())

  const token = computed(() => userData.value?.token ?? null)
  const user = computed(() => userData.value?.user ?? null)
  const isLoggedIn = computed(() => Boolean(token.value))
  const isTestUser = computed(() => isAuthTestUser(user.value))
  const isAdmin = computed(() => isAuthAdmin(user.value))

  function setUser(data) {
    userData.value = data
    writeAuthSession(data)
  }

  function clearUser() {
    userData.value = null
    sessionStorage.removeItem(AUTH_STORAGE_KEY)
  }

  return { userData, token, user, isLoggedIn, isTestUser, isAdmin, setUser, clearUser }
})
