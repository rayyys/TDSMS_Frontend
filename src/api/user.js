import request from './request'

export function login(data) {
  return request({
    method: 'post',
    url: '/auth/login',
    data,
  })
}

export function register(data) {
  return request({
    method: 'post',
    url: '/user/register/',
    data,
  })
}

export function logout(data) {
  return request({
    method: 'post',
    url: '/auth/logout',
    data,
  })
}
