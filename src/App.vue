<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { prefetchAllRoutes } from '@/router'

onMounted(() => {
  // 首屏渲染完成后，利用浏览器空闲时间后台预加载各路由组件，
  // 消除首次跳转时懒加载组件按需编译/网络加载造成的卡顿、白屏
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => prefetchAllRoutes())
  } else {
    setTimeout(() => prefetchAllRoutes(), 2000)
  }
})
</script>

<style>
#app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100vh;
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>
