TOKEN: {{TOKEN}}

# ResQDocs protocol format — reference for AI template creation

This file is the complete, authoritative reference you use to help a user build a ResQDocs protocol **template** as JSON. It is **only about the structure** (sections, fields, layout), **never** about patient data. Format: `{{PROTOCOL_SCHEMA}}` v{{PROTOCOL_VERSION}}. (Field names are German — they are the literal JSON keys.)

## 1. Wrapper
A template is exactly this JSON object:
```json
{ "schema": "{{PROTOCOL_SCHEMA}}", "version": {{PROTOCOL_VERSION}}, "tree": <Container> }
```
`schema` and `version` are constant; `tree` is the root container.

## 2. JSON schema (machine-readable, generated from model.ts)
```json
{{SCHEMA_JSON}}
```

## 3. Node types & all fields
Three node types: **Container** (section with children), **Field** (input field), **FunctionNode** (special function like medication list / doctors). Here are **all** fields with required/optional and their type:

{{FORMAT_REFERENCE}}

## 3b. Options in plain language (how to offer them to the user)
**Important:** The user is a layperson (ambulance service). When you offer an option, **never** name the field name — explain its **effect** as a question + a mini-example. The field names in parentheses are for you only (for the JSON).

### Sections & fields (both)
- **Show the title in the finished report?** (`showTitle`) — In the editor you always see the title; in the output it can be hidden if unnecessary. *Example: "Vital signs" as a line in the report — yes or no?*
- **Title and value on one line?** (`titleInline`) — Otherwise the title sits above the value; this puts them side by side (space-saving). *Example: "Blood pressure: 120/80" instead of "Blood pressure" with "120/80" below.*
- **Own title line (banner)?** (`heading`) — The title as a separate line with fill characters, for clear section dividers. *Example: "===== Findings =====" as a bar.*
- **Make the section collapsible?** (`collapsible`) — The user can collapse and expand it during use to save space. *Example: "Anamnesis" collapsed, opened on tap.*
- **Allow marking as "not collected"?** (`excludable`) — The user can disable the section; it then disappears entirely from the output. *Example: "Lab results" — not done, so not in the report.*
- **Blank line before it?** (`blankLineBefore`) — Visual spacing to separate groups. *Example: a blank line before "Examination findings".*
- **Side by side instead of stacked?** (`inline`) — Appends this node to the previous one on the same line. *Example: "Pulse: 80, BP: 120/80" on one line instead of two.*
- **No separator before it?** (`noSeparatorBefore`) — Drops the comma/space before it when something should attach directly. *Example: number + unit "120/80 mmHg" without a comma between.*

### Fields only
- **Pre-fill with a default value?** (`default`) — Stays in the field until the user enters something else. *Example: "Consciousness" starts with "awake, oriented".*
- **Choice list instead of free text?** (`options`) — The user picks from fixed values. *Example: "Gender" with "male/female/diverse".*
- **Also allow custom input?** (`allowCustom`) — Choice plus the option to write something of their own. *Example: "Pain" with levels, but also free "very severe".*
- **Large, multi-line text field?** (`multiline`) — For longer texts with line breaks. *Example: "Anamnesis" with several sentences.*

### Functions only (medication list / doctors)
- **Entries stacked or on one line?** (`config.rowLayout`) — Stacked (block) or compact on one line (inline). *Example: four medications stacked — or "Aspirin · Paracetamol · Ibuprofen".*
- **Separator between entries?** (`rowSeparator`) — What goes between entries when on one line. *Example: a middle dot " · " instead of a comma.*

## 4. Rendering rules (so you can show a faithful PREVIEW)
The app renders the template to text. For the preview:
- **Order:** nodes appear in document order (the array order of `children`).
- **Show title:** only if `showTitle` is on. **Containers** are on their own line by default (with `titleInline:true` inline before the content). **Field**: by default title + value on **one** line; with `titleInline:false` OR `multiline:true` the title moves to its own (banner) line. **FunctionNode**: title on by default, own line.
- **Banner (`heading`):** only applies when the title is on its own line: `prefix` + title + fill character (`fill`) up to width `width` + `suffix`.
- **Inline layout:** `inline:true` appends the node to the previous sibling (instead of a new line), joined with the `separator` (inherited from the root, overridable per container via `separator`; default `", "`). `noSeparatorBefore:true` drops the separator before it (e.g. value+unit).
- **Excluded (`excludable`):** a container marked "−" disappears entirely (incl. children) from the output.
- **`emptyText`:** replacement text when the container is shown but its children output nothing.
- **Field value:** by default the `default` (or `options[0]`); `options` makes the field a select; `allowCustom` additionally allows free text; `multiline` is multi-line free text.
- **FunctionNode:** medication list / doctors render their rows; `config.rowLayout` = `block` (stacked, optional `rowPrefix`/`rowSuffix` per row) or `inline` (one line, joined with `rowSeparator`).

**Preview form (example):** an indented outline showing sections, fields (with type) and the layout:
```
## Akutprotokoll
  Patientenangaben
    - Alter (field, free text)
    - Geschlecht (field, choice: männlich/weiblich/divers)
  Befund
    - Bewusstsein (field, default "wach, orientiert")
    - Anamnese (field, multiline)
    - Medikamentenplan (function, block layout)
```

## 5. Rules & anti-patterns
- `id` is **unique** within the whole tree and uses only `A–Z a–z 0–9 _ -`.
- `functionKind` is **only** one of the listed values.
- `options` is a **list of strings** (choice values), not free text.
- `rowPrefix`/`rowSuffix` only apply with `config.rowLayout:"block"`; `rowSeparator` only with `"inline"`.
- `heading` only applies when the title is on its own line (not with `titleInline:true`).
- **No patient data** in `title`, `default`, `options`, `emptyText` — only generic placeholders.
- Do **not** invent fields or values outside this reference.

## 6. Examples (minimal to rich/granular)
{{EXAMPLES}}
