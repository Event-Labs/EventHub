import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'
import './RichTextEditor.css'

export default function RichTextEditor({
    value,
    onChange,
    placeholder = 'Nhập mô tả chi tiết cho sự kiện...',
    onImageUpload,
}) {
    const quillRef = useRef(null)

    const imageHandler = useCallback(() => {
        const input = document.createElement('input')
        input.setAttribute('type', 'file')
        input.setAttribute('accept', 'image/*')
        input.click()

        input.onchange = async () => {
            const file = input.files?.[0]
            if (!file) return

            const editor = quillRef.current?.getEditor()
            if (!editor) return

            const range = editor.getSelection(true) || { index: editor.getLength() }

            if (onImageUpload) {
                try {
                    const url = await onImageUpload(file)
                    if (url) {
                        editor.insertEmbed(range.index, 'image', url)
                        editor.setSelection(range.index + 1)
                    }
                } catch (err) {
                    console.error('Image upload failed:', err)
                }
            } else {
                const reader = new FileReader()
                reader.onload = () => {
                    editor.insertEmbed(range.index, 'image', reader.result)
                    editor.setSelection(range.index + 1)
                }
                reader.readAsDataURL(file)
            }
        }
    }, [onImageUpload])

    const modules = useMemo(
        () => ({
            toolbar: {
                container: [
                    [{ header: [1, 2, 3, false] }],
                    [{ font: [] }],
                    [{ size: ['small', false, 'large', 'huge'] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ color: [] }, { background: [] }],
                    [{ align: [] }],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    ['link', 'image'],
                    ['clean'],
                ],
                handlers: {
                    image: imageHandler,
                },
            },
        }),
        [imageHandler],
    )

    const formats = [
        'header',
        'font',
        'size',
        'bold',
        'italic',
        'underline',
        'strike',
        'color',
        'background',
        'align',
        'list',
        'link',
        'image',
    ]

    useEffect(() => {
        const editor = quillRef.current?.getEditor()
        if (!editor) return

        // Hook into text-change to keep the tooltip preview tag synchronized when user edits the link text
        const handleTextChange = () => {
            try {
                const tooltip = editor.theme?.tooltip
                if (!tooltip || !tooltip.linkRange || tooltip.root.classList.contains('ql-hidden')) return

                const linkRange = tooltip.linkRange
                // Check if cursor/selection is still in the link range
                const leaf = editor.getLeaf(linkRange.index)?.[0]
                if (leaf && leaf.domNode) {
                    const parentA = leaf.domNode.closest ? leaf.domNode.closest('a') : leaf.domNode.parentElement
                    if (parentA && parentA.tagName === 'A') {
                        const href = parentA.getAttribute('href') || parentA.textContent
                        if (tooltip.preview && href) {
                            tooltip.preview.textContent = href
                            tooltip.preview.setAttribute('href', href)
                        }
                    }
                }
            } catch {
                // Ignore any DOM traversal edge cases
            }
        }

        editor.on('text-change', handleTextChange)
        return () => {
            editor.off('text-change', handleTextChange)
        }
    }, [])

    return (
        <div className="rich-text-editor-container rounded-lg border border-border-soft/40 shadow-inner">
            <ReactQuill
                ref={quillRef}
                theme="snow"
                value={value || ''}
                onChange={onChange}
                placeholder={placeholder}
                modules={modules}
                formats={formats}
            />
        </div>
    )
}
