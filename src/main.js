import { createApp } from 'vue'
import App from './App.vue'
import './scss/app.scss'
import 'bootstrap'
import 'bootstrap-icons/font/bootstrap-icons.css'
import i18n from './plugins/i18n.js'

createApp(App)
    .use(i18n)
    .mount('#app')
