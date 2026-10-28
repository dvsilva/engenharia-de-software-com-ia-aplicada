---
name: web-accessibility
description: Pages that assistive technology can read and the keyboard can drive, from labels tied to their fields, ARIA roles, names, and descriptions, and live regions that announce loading, success, and failure to modal dialogs that take focus and close with Escape, as the course's Angular pages and OpsPilot's React War Room do.
---

# Web accessibility

## Concept

An accessible page exposes its meaning to assistive technology and works from the keyboard. Every field has a label tied to it, widgets that HTML lacks declare their role and states through WAI-ARIA, a button showing only an icon gets a name, and decoration is hidden from screen readers. A dialog that interrupts the user declares itself modal, points to its title and message as its name and description, moves focus inside when it opens, and closes with Escape. A change away from the focus, such as a form's result or a list still loading, is announced through a live region: an alert for failures, and a busy status while waiting. Required fields say so to assistive technology, and a table's headers name their columns. Text keeps enough contrast with its background. Roles, names, descriptions, and where focus lands are part of what the page shows, and they are plain HTML attributes and DOM focus, so they move to any framework unchanged.

## How the course implements it

pix-app's error modal comes from a prompt that asks for WAI-ARIA markup, keyboard support, and design tokens ([coding-agent-harness](coding-agent-harness.md)). The dialog has role alertdialog, aria-modal true, aria-labelledby pointing to its title (Limite Excedido), and aria-describedby pointing to its message. The close button is named Fechar through aria-label, and its × is aria-hidden. After the modal renders, focus moves to the close button, and Escape anywhere in the document, the close button, or a click on the backdrop closes it. The transfer form ties each label to its field through for and id. The component around the modal follows [component-framework](component-framework.md).

cfp-platform's specs ask for WAI-ARIA too ([coding-agent-harness](coding-agent-harness.md)). Each form is named by its heading through aria-labelledby, ties its labels to its fields, and marks every required field with required and aria-required, while the optional GDE checkbox comes before its label. Each form keeps a feedback container with role alert and aria-live polite from the start, and the success or failure message appears inside it, its ✓ or ⚠ written as text. The dashboard's loading box has role status and aria-busy true, its error box has role alert, and its table sits in a region named Submitted talks, with every column header scoped to its column.

OpsPilot's War Room, the **React** page of unit 8, follows design instructions scoped to its folder, which ask for explicit labels, errors tied to their field, Escape closing overlays, and focus held inside modals ([coding-agent-harness](coding-agent-harness.md)). The message field and the Exigir aprovação checkbox are tied to their labels through ids from useId, and the gear button, which shows only ⚙, is named Configurações. The thread is an ordered list with aria-live polite, the empty state before it has role status, a failed turn shows a banner with role alert, and a held request shows a section named Ação pendente, whose decision appears with role status and whose failure with role alert. The settings and the reasoning are dialogs with aria-modal true, named by their headings, Configurações and Raciocínio, through aria-labelledby. Opening the settings focuses the URL field, and an address that is not http(s) shows Informe uma URL http(s) válida with role alert, sets aria-invalid on the field, and points its aria-describedby to the message, until the field changes. Opening the reasoning focuses its close button, named Fechar raciocínio. Escape or a click on the backdrop closes either dialog. The page itself follows [component-framework](component-framework.md).

## What usually goes wrong in other languages

- pix-app's source comments promise a focus trap, and the War Room's instructions ask for one, but neither page has it: Tab leaves the dialog, and focus does not return to the button that opened it after closing. A transcription may add both without failing the cases, which never press Tab.
- The War Room's URL field carries aria-invalid false until an error and true with one, and the cases read both, so a transcription renders the attribute in both states instead of removing it.
- The War Room's thread exists only from the first message, which replaces the empty state, so screen readers may miss that message. The cases read the page as the original renders it, and a transcription keeps it.
- Focus can only move once the element exists, so it happens after render: an effect with a ref in **React**, onMounted in **Vue**, onMount in **Svelte**, and OnAfterRenderAsync with FocusAsync in **Blazor**.
- JSX writes for as htmlFor, while aria-* and role pass through unchanged in **React**, **Vue**, and **Svelte**.
- The cases resolve aria-labelledby and aria-describedby to the elements they name instead of reading the ids, so generated ids, such as **React**'s useId, pass. Hard-coded ids must stay unique in the document.
- The cases press Escape through the browser's own input, so either a document keydown listener, as the original has, or the native dialog element's handling closes the modal. They click the backdrop as an element, so a transcription that moves to the native dialog element keeps a backdrop element with its class rather than relying on ::backdrop.
- Screen readers often miss a live region inserted together with its content, so cfp-platform's forms keep their feedback container and change only the message inside. A transcription renders the container always and the message conditionally, and the cases read it empty before the first submit.
- role alert implies an assertive live region, which the forms' explicit aria-live polite overrides, so a transcription keeps both attributes as they are.
- Shadow DOM breaks ARIA references across its boundary and hides the dialog from document queries, so the modal renders into the light DOM.
- pix-app's light theme gives the menu links the same color as the menu's background (#0A192F), so they only show on hover, and a lesson prompt fixes the receipt's contrast with a --color-text-light token the stylesheet never defines. The cases keep the original's colors, so a transcription reproduces both instead of fixing them silently, and points them out.

## How close common targets get

The attributes and focus calls are the same in every target that renders HTML, so the fit follows the page itself in [browser-app](browser-app.md).

| Target                                          | Fit                | Library                                                                  |
| ----------------------------------------------- | ------------------ | ------------------------------------------------------------------------ |
| **JavaScript** and **TypeScript**               | Direct equivalent  | ARIA attributes in the markup and element.focus()                        |
| **React**, **Vue**, **Angular**, and **Svelte** | Direct equivalent  | The same attributes in templates, with a ref focused after render        |
| **C#**                                          | Direct equivalent  | **Blazor** markup with ElementReference.FocusAsync                       |
| **Rust**                                        | Direct equivalent  | **Leptos** views with a NodeRef focused in an effect                     |
| **Go**                                          | Direct equivalent  | **go-app** elements with ARIA attributes and focus through the DOM       |
| **Python**                                      | Direct equivalent  | **PyScript** setting attributes and calling focus() on the element       |
| **Java**                                        | Nothing comparable | The page stays in **TypeScript** and is explained instead of transcribed |
| **C++**                                         | Nothing comparable | The page stays in **TypeScript** and is explained instead of transcribed |

The tested **React** transcriptions of pix-app and of cfp-platform's frontend, and the **Vue** one of the War Room, are kept with the component-framework examples.

## Tolerance

The cases compare the dialog's role, modal state, resolved name and description, the focused element's name, and each way of closing exactly, since none of them varies.

## Where it appears

- modulo04-criacao-de-agentes-autonomos-novo/08-projeto-pratico-opspilot-publicado/web (the War Room)
- modulo04-criacao-de-agentes-autonomos-novo/09-multi-agent-systems/web (the War Room)
- modulo05-ferramentas-de-IA-para-UI-UX/modulo-02/pix-app
- modulo05-ferramentas-de-IA-para-UI-UX/modulo-03/cfp-platform (the frontend)
- modulo05-ferramentas-de-IA-para-UI-UX/modulo-04/cfp-plataform_v1/cfp-platform_v1 (the same frontend)
