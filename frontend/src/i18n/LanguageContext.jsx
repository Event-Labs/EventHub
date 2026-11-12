import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import viLocale from './locales/vi.json'
import enLocale from './locales/en.json'
import { VI_TO_EN, EN_TO_VI, translatePhrase, translateComposite } from './phraseDictionary.js'
import { getStoredUser, updateStoredUser, isAuthenticated } from '@/lib/auth.js'
import { updateProfile } from '@/services/user.service.js'

const STORAGE_LOCALE_KEY = 'eventhub_locale'
const dictionaries = {
  vi: viLocale,
  en: enLocale,
}

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_LOCALE_KEY)
      if (saved === 'vi' || saved === 'en') return saved
      const user = getStoredUser()
      if (user?.locale === 'vi' || user?.locale === 'en') return user.locale
    } catch {
      // Ignore storage access errors
    }
    return 'vi'
  })

  useEffect(() => {
    try {
      document.documentElement.lang = language
    } catch {
      // Ignore DOM access errors
    }
  }, [language])

  // Global DOM auto-translation for seamless full-page English experience
  useEffect(() => {
    if (language !== 'en') {
      // Revert any translated nodes
      if (window.__eventhub_translated_nodes && window.__eventhub_translated_nodes.size > 0) {
        window.__eventhub_translated_nodes.forEach((originalText, node) => {
          try {
            if (node && node.parentNode && node.nodeValue !== originalText) {
              node.nodeValue = originalText
            }
          } catch {
            // Ignore node access errors
          }
        })
        window.__eventhub_translated_nodes.clear()
      }
      if (window.__eventhub_translated_attrs && window.__eventhub_translated_attrs.size > 0) {
        window.__eventhub_translated_attrs.forEach((attrs, el) => {
          try {
            if (el && el.parentNode) {
              for (const [attrName, origVal] of Object.entries(attrs)) {
                el.setAttribute(attrName, origVal)
                if (attrName === 'placeholder') {
                  try { el.placeholder = origVal } catch {}
                }
              }
            }
          } catch {
            // Ignore attr access errors
          }
        })
        window.__eventhub_translated_attrs.clear()
      }
      return undefined
    }

    if (!window.__eventhub_translated_nodes) {
      window.__eventhub_translated_nodes = new Map()
    }
    if (!window.__eventhub_translated_attrs) {
      window.__eventhub_translated_attrs = new Map()
    }
    const translatedMap = window.__eventhub_translated_nodes
    const translatedAttrsMap = window.__eventhub_translated_attrs

    const skipTags = new Set(['INPUT', 'TEXTAREA', 'SCRIPT', 'STYLE', 'CODE', 'PRE'])

    const translateElementAttrs = (el) => {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        const ph = el.getAttribute('placeholder')
        if (ph) {
          const transPh = translatePhrase(ph, 'en')
          if (transPh && transPh !== ph) {
            if (!translatedAttrsMap.has(el)) translatedAttrsMap.set(el, {})
            const stored = translatedAttrsMap.get(el)
            if (!stored.placeholder) stored.placeholder = ph
            el.setAttribute('placeholder', transPh)
            try { el.placeholder = transPh } catch {}
          }
        }
      }
      const dataPh = el.getAttribute('data-placeholder')
      if (dataPh) {
        const transDataPh = translatePhrase(dataPh, 'en')
        if (transDataPh && transDataPh !== dataPh) {
          if (!translatedAttrsMap.has(el)) translatedAttrsMap.set(el, {})
          const stored = translatedAttrsMap.get(el)
          if (!stored['data-placeholder']) stored['data-placeholder'] = dataPh
          el.setAttribute('data-placeholder', transDataPh)
        }
      }
      const title = el.getAttribute('title')
      if (title) {
        const transTitle = translatePhrase(title, 'en')
        if (transTitle && transTitle !== title) {
          if (!translatedAttrsMap.has(el)) translatedAttrsMap.set(el, {})
          const stored = translatedAttrsMap.get(el)
          if (!stored.title) stored.title = title
          el.setAttribute('title', transTitle)
        }
      }
      const ariaLabel = el.getAttribute('aria-label')
      if (ariaLabel) {
        const transAria = translatePhrase(ariaLabel, 'en')
        if (transAria && transAria !== ariaLabel) {
          if (!translatedAttrsMap.has(el)) translatedAttrsMap.set(el, {})
          const stored = translatedAttrsMap.get(el)
          if (!stored['aria-label']) stored['aria-label'] = ariaLabel
          el.setAttribute('aria-label', transAria)
        }
      }
    }

    const translateNode = (node) => {
      if (!node || node.nodeType !== Node.TEXT_NODE) return
      const parent = node.parentElement
      if (!parent) return
      if (skipTags.has(parent.tagName) || parent.isContentEditable || parent.closest('[data-no-translate]')) {
        return
      }

      const raw = node.nodeValue
      if (!raw) return
      const trimmed = raw.trim()
      if (!trimmed) return

      const translated = translatePhrase(raw, 'en')
      if (translated && translated !== raw) {
        if (!translatedMap.has(node)) {
          translatedMap.set(node, raw)
        }
        node.nodeValue = translated
      }
    }

    const walkAndTranslate = (root) => {
      if (!root) return
      if (root.nodeType === Node.ELEMENT_NODE) {
        translateElementAttrs(root)
        try {
          const attrElements = root.querySelectorAll?.('input[placeholder], textarea[placeholder], [data-placeholder], [title], [aria-label]')
          if (attrElements) {
            for (let i = 0; i < attrElements.length; i++) {
              translateElementAttrs(attrElements[i])
            }
          }
        } catch {
          // Ignore query errors on detached nodes
        }
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement
          if (!parent) return NodeFilter.FILTER_REJECT
          if (skipTags.has(parent.tagName) || parent.isContentEditable || parent.closest('[data-no-translate]')) {
            return NodeFilter.FILTER_REJECT
          }
          return NodeFilter.FILTER_ACCEPT
        },
      })

      let currentNode
      while ((currentNode = walker.nextNode())) {
        translateNode(currentNode)
      }
    }

    // Initial pass on document
    walkAndTranslate(document.body)

    // Mutation queue to avoid dropping mutations on rapid React re-renders
    const mutationQueue = []
    let rafId = null

    const processQueue = () => {
      rafId = null
      while (mutationQueue.length > 0) {
        const mutation = mutationQueue.shift()
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((added) => {
            if (added.nodeType === Node.TEXT_NODE) {
              translateNode(added)
            } else if (added.nodeType === Node.ELEMENT_NODE) {
              walkAndTranslate(added)
            }
          })
        } else if (mutation.type === 'characterData') {
          translateNode(mutation.target)
        } else if (mutation.type === 'attributes') {
          translateElementAttrs(mutation.target)
        }
      }
    }

    const observer = new MutationObserver((mutations) => {
      mutationQueue.push(...mutations)
      if (!rafId) {
        rafId = requestAnimationFrame(processQueue)
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'data-placeholder', 'title', 'aria-label'],
    })

    // Periodic sweep for asynchronous fetches / canvas re-renders
    const intervalId = setInterval(() => {
      walkAndTranslate(document.body)
    }, 400)

    const handleRouteChange = () => {
      setTimeout(() => walkAndTranslate(document.body), 30)
      setTimeout(() => walkAndTranslate(document.body), 200)
    }
    window.addEventListener('popstate', handleRouteChange)

    // Intercept pushState & replaceState for SPA React Router page transitions
    const originalPushState = history.pushState
    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args)
      handleRouteChange()
      return result
    }

    const originalReplaceState = history.replaceState
    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args)
      handleRouteChange()
      return result
    }

    return () => {
      observer.disconnect()
      clearInterval(intervalId)
      window.removeEventListener('popstate', handleRouteChange)
      history.pushState = originalPushState
      history.replaceState = originalReplaceState
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [language])

  const setLanguage = useCallback((newLang) => {
    const validLang = newLang === 'en' ? 'en' : 'vi'
    setLanguageState(validLang)
    try {
      localStorage.setItem(STORAGE_LOCALE_KEY, validLang)
      document.documentElement.lang = validLang
      window.dispatchEvent(new CustomEvent('eventhub-locale-changed', { detail: { locale: validLang } }))
      
      if (isAuthenticated()) {
        updateStoredUser({ locale: validLang })
        updateProfile({ locale: validLang }).catch(() => {
          // Ignore background sync errors
        })
      }
    } catch {
      // Ignore storage errors
    }
  }, [])

  const t = useCallback(
    (keyPath, params = {}) => {
      if (!keyPath || typeof keyPath !== 'string') return ''
      
      const trimmed = keyPath.trim()
      if (language === 'en') {
        const trans = translatePhrase(trimmed, 'en')
        if (trans && trans !== trimmed) return trans
      }
      if (language === 'vi' && EN_TO_VI[trimmed]) {
        return EN_TO_VI[trimmed]
      }

      const keys = keyPath.split('.')
      
      // Look up in current language
      let value = keys.reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), dictionaries[language])
      
      // Fallback to alternative language if missing
      if (value === undefined) {
        const fallbackLang = language === 'vi' ? 'en' : 'vi'
        value = keys.reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), dictionaries[fallbackLang])
      }
      
      // If still missing, check phrase dictionary
      if (value === undefined) {
        if (language === 'en') return translatePhrase(keyPath, 'en')
        return keyPath
      }
      
      if (typeof value === 'string' && params && typeof params === 'object') {
        return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, matchKey) => {
          return params[matchKey] !== undefined ? params[matchKey] : `{{${matchKey}}}`
        })
      }
      
      return value
    },
    [language]
  )

  const formatCurrency = useCallback(
    (amount, options = {}) => {
      const num = Number(amount) || 0
      if (language === 'en') {
        const formatted = new Intl.NumberFormat('en-US').format(num)
        return options.symbol === false ? formatted : `${formatted} VND`
      }
      const formatted = new Intl.NumberFormat('vi-VN').format(num)
      return options.symbol === false ? formatted : `${formatted} ₫`
    },
    [language]
  )

  const formatDate = useCallback(
    (date, options = {}) => {
      if (!date) return ''
      const d = new Date(date)
      if (Number.isNaN(d.getTime())) return ''
      return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'vi-VN', options).format(d)
    },
    [language]
  )

  const isVietnamese = language === 'vi'
  const isEnglish = language === 'en'

  const contextValue = useMemo(
    () => ({
      language,
      setLanguage,
      t,
      formatCurrency,
      formatDate,
      isVietnamese,
      isEnglish,
    }),
    [language, setLanguage, t, formatCurrency, formatDate, isVietnamese, isEnglish]
  )

  return <LanguageContext.Provider value={contextValue}>{children}</LanguageContext.Provider>
}

const FALLBACK_LANG_VI = Object.freeze({
  language: 'vi',
  setLanguage: () => {},
  t: (key) => key,
  formatCurrency: (num, opts = {}) => {
    const val = Number(num || 0)
    const formatted = new Intl.NumberFormat('vi-VN').format(val)
    return opts.symbol === false ? formatted : `${formatted} ₫`
  },
  formatDate: (date, opts = {}) => {
    if (!date) return ''
    const d = new Date(date)
    if (Number.isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('vi-VN', opts).format(d)
  },
  isVietnamese: true,
  isEnglish: false,
})

const FALLBACK_LANG_EN = Object.freeze({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
  formatCurrency: (num, opts = {}) => {
    const val = Number(num || 0)
    const formatted = new Intl.NumberFormat('en-US').format(val)
    return opts.symbol === false ? formatted : `$${formatted}`
  },
  formatDate: (date, opts = {}) => {
    if (!date) return ''
    const d = new Date(date)
    if (Number.isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('en-US', opts).format(d)
  },
  isVietnamese: false,
  isEnglish: true,
})

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    const locale =
      (typeof localStorage !== 'undefined' && localStorage.getItem('eventhub_locale')) ||
      'vi'
    return locale === 'en' ? FALLBACK_LANG_EN : FALLBACK_LANG_VI
  }
  return context
}

export const useTranslation = useLanguage

