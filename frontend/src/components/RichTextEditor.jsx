import React from 'react'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'
import './RichTextEditor.css'

export default function RichTextEditor({ value, onChange, placeholder = 'Nhập mô tả chi tiết cho sự kiện...' }) {
    const modules = {
        toolbar: [
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
    }

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

    return (
        <div className="rich-text-editor-container rounded-lg overflow-hidden border border-border-soft/40 shadow-inner">
            <ReactQuill
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
