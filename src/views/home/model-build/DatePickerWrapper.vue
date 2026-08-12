<template>
  <div class="model-date-picker-wrapper">
    <newDayTime v-model="computedValue" v-bind="$attrs" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import newDayTime from './newDayTime.vue'

const props = defineProps({
  modelValue: {
    type: [String, Date, Number],
    default: null,
  },
})
const emit = defineEmits(['update:modelValue'])

const computedValue = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})
</script>

<style scoped>
.model-date-picker-wrapper {
  /* 为内部绝对定位的 popper 提供定位参考 */
  position: relative;
  /* 确保弹窗在页面中具有足够的层叠层级 */
  z-index: 1;
}
</style>
