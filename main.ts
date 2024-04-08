import { assert } from 'console';
import { App, ButtonComponent, Editor, EditorPosition, MarkdownFileInfo, MarkdownView, Modal, Notice, Platform, Plugin, PluginSettingTab, Setting, TextAreaComponent, ToggleComponent, Workspace } from 'obsidian';


interface AutoHyperlinkSettings {
    enableEditorMode: boolean;
    enableMobile: boolean;
    rule: string;
}

const DEFAULT_SETTINGS: AutoHyperlinkSettings = {
    enableEditorMode: false,
    enableMobile: false,
    rule: '[]'
}

interface MatchRecord {
    match: RegExpMatchArray,
    start: number,
    length: number,
    line: number,
    regex: RegExp,
    url: string
}

export default class AutoHyperlinkPlugin extends Plugin {
	settings: AutoHyperlinkSettings;

	async onload() {
		await this.loadSettings();

        let getUrl = (urlTemplate: string, match: RegExpMatchArray) => {
            let url = urlTemplate.substring(0);
            for (let i = 0; i < match.length ; ++i) {
                let x = "$" + i.toString();
                if (i == 0) {
                    url = url.replace(x, match[i].substring(0, match[i].length));
                } else {
                    url = url.replace(x, match[i]);
                }
                console.log("i = ", i, ", x = ", x, ", url=\"", url, "\"");
            }
            if (!url.startsWith("https://") && !url.startsWith("http://")) {
                url = "https://" + url;
            }
            return url;
        }

        let currentRecord: MatchRecord | null = null;
        let getMatchFromLine = (line: string, cursorPos: EditorPosition, start: number = 0) => {
            // obtain rule
            const rules = JSON.parse(this.settings.rule);
            // get cursor position
            let pos = cursorPos.ch;
            // search matched string
            let lineSlice = line.substring(start);
            for (const [pattern, urlTemplate] of Object.entries<string>(rules)) {
                // get all matches
                const regex = new RegExp(pattern, 'g');
                let matches = lineSlice.matchAll(regex);
                for (const match of matches) {
                    // skip if matched position is undefined
                    if (match.index === undefined) {
                        continue;
                    }
                    console.log('match candidate: ' + match[0]);
                    // skip if matched position is far from cursor position
                    console.log('pos ' + pos);
                    console.log('match range: ' + match.index + ', ' + match.index + match[0].length);
                    if (pos < match.index + start || match.index + start + match[0].length < pos) {
                        continue;
                    }
                    console.log("Found ", match[0], " start=", match.index, " end=", match.index + match[0].length, "match.length = ", match.length);
                    let index = match.index + start;
                    let url = getUrl(urlTemplate, match);
                    let record: MatchRecord = {
                        match: match,
                        start: index,
                        length: match[0].length,
                        line: cursorPos.line,
                        regex: regex,
                        url: url
                    }
                    return record;
                }
            }

            // no match is found
            return null;
        }

        let isPartOfAppliedString = (line: string, record: MatchRecord) => {
            let index = 0;
            let isApplied = false;
            let pos = record.match.index;
            let url = record.url;
            while (pos && index > 0) {
                index = line.indexOf(url, index);
                if (index <= pos && pos <= index + url.length) {
                    isApplied = true;
                    break;
                }
            }
            return false;
        }

        let applyRuleToLine = (line: string, record: MatchRecord) => {
            console.log('insert hyperlink...');
            let url = record.url;
            let match = record.match;
            let start = record.start;
            let appliedLine = line;
            if (typeof start == "number") {
                let end = start + match[0].length;
                if (line.substring(end, end + url.length + 3) != '](' + url + ')') {
                    appliedLine = line.substring(0, start) + '[' + match[0] + '](' + url + ')' + line.substring(end);
                }
            }
            return appliedLine;
        }

        let applyInProgress = false;
        let applyCurrentRecord = function(editor: Editor, record: MatchRecord) {
            console.log('Current match: ', record.match[0], record.line, record.start, record.length);
            let lineString = editor.getLine(record.line);
            let isApplied = isPartOfAppliedString(lineString, record);
            console.log('isApplied', isApplied);
            if (!isApplied) { 
                let applied = applyRuleToLine(lineString, record);
                console.log('applied = ' + applied);

                applyInProgress = true;

                console.log('Applied: ' + applied);
                editor.setLine(record.line, applied);

                applyInProgress = false;
            }
        }

        let applyX = function(editor: Editor, info: MarkdownView | MarkdownFileInfo) {
            const isEnabledOnEditorMode = this.settings.enableEditorMode;
            console.log('isEnabledOnEditorMode = ', isEnabledOnEditorMode);
            if (!isEnabledOnEditorMode) {
                return;
            }

            console.log('applyX: Line -> ', editor.getLine(editor.getCursor().line));
            if (applyInProgress) {
                return;
            }

            // console.log(info);

            const cursorPos = editor.getCursor();
            if (!cursorPos) {
                return;
            }

            if (currentRecord) {
                // there is match record
                console.log('Previous match record: ', currentRecord.match[0]);
                if (cursorPos.line != currentRecord.line) {
                    // cursor is on the different line -> apply rule & clear record
                    applyCurrentRecord(editor, currentRecord);
                    currentRecord = null;
                } else {
                    // Check if match record need to be updated
                    let start = currentRecord.match.index;
                    assert(typeof start == "number");
                    let end = cursorPos.ch;
                    let lineString = editor.getLine(cursorPos.line);
                    let updatedRecord = getMatchFromLine(lineString, cursorPos, start);
                    if (updatedRecord) {
                        console.log('New match: ', updatedRecord.match[0], updatedRecord.start, updatedRecord.length);             
                        console.log('Old match: ', currentRecord.match[0], currentRecord.start, currentRecord.length);
                    }
                    if (updatedRecord && (updatedRecord.start + updatedRecord.length) == end) {
                        // new match found -> update record
                        console.log('New match record: ', updatedRecord.match[0]);
                        currentRecord = updatedRecord;
                    } else {
                        // no match found -> apply rule 
                        if (!(cursorPos.ch < currentRecord.start + currentRecord.length)) {
                            // apply only when any character was added 
                            // i.e. do not apply rule when any character was deleted
                            applyCurrentRecord(editor, currentRecord);
                        }
                        currentRecord = null;
                    }
                    console.log(currentRecord);
                }
            } else {
                    // get string from the current line
                    let line = editor.getLine(cursorPos.line);
                    console.log('Line: ' + line);
                    // search matched string
                    // matched range should include current cursor position
                    let record = getMatchFromLine(line, cursorPos);
                    if (record && !isPartOfAppliedString(line, record)) {
                        currentRecord = record;
                    }
            }
        };

        this.app.workspace.on('editor-change', applyX, this);
        // this.app.workspace.on('editor-paste', applyOnPaste);

        let applyRule = (node: Node, pattern: string, urlTemplate: string) => {
            console.debug("applyRule");
            if (!node.textContent) {
                return;
            }

            let parent = node.parentElement;
            let regexStr = pattern;
            const regex = new RegExp(regexStr, 'g');
            let txt = node.textContent;
            let matches = txt.matchAll(regex);
            let txtStartIndex = 0;
            let converted = new Array<Node>();
            for (const match of matches) {
                if (match.index === undefined) {
                    continue;
                }

                console.debug("Found ", match[0], " start=", match.index, " end=", match.index + match[0].length, "match.length = ", match.length);
                let a = document.createElement('a');
                a.textContent = match[0];
                let url = urlTemplate;
                for (let i = 0; i < match.length ; ++i) {
                    let x = "$" + i.toString();
                    url = url.replace(x, match[i]);
                    console.debug("i = ", i, ", x = ", x, ", url=\"", url, "\"");
                }
                if (url.startsWith('https://') || url.startsWith('http://')) {
                    a.setAttribute('href', url);
                } else {
                    a.setAttribute('href', "https://" + url);
                }
                if (txtStartIndex < match.index) {
                    const substr = txt.substring(txtStartIndex, match.index);
                    converted = converted.concat(document.createTextNode(substr));
                }
                converted = converted.concat(a);
                txtStartIndex = match.index + match[0].length;
            }
            console.debug("converted = ", converted);
            if (converted.length > 0) {
                if (txtStartIndex < txt.length) {
                    const substr = txt.substring(txtStartIndex, txt.length);
                    console.debug("tail = ", substr);
                    node.textContent = substr;
                } else {
                    node.textContent = "";
                }
                for (let x of converted) {
                    console.debug("inserting ", x);
                    parent?.insertBefore(x, node);
                }
            }
        };

        let applyRecursive = (node: Node, pattern: string, urlTemplate: string) => {
            console.debug("applyRecursive");
            console.debug("element.nodeName = ", node.nodeName);
            const ignoreNodeList = ["A", "PRE"];
            if (node.nodeName == "A" || node.nodeName == "PRE") {
                console.debug("ignoring ", node.nodeName);
                return;
            }

            node.childNodes.forEach((child) => {
                console.debug("  Apply rule to child", child.nodeName);
                if (child.nodeName == "#text") {
                    // apply converter and continue
                    applyRule(child, pattern, urlTemplate);
                } else {
                    applyRecursive(child, pattern, urlTemplate);
                }
            });
        };

        // post processing to insert external link
        this.registerMarkdownPostProcessor((element, context) => {
            const isMobile = Platform.isMobile;
            const isEnabledOnMobile = this.settings.enableMobile;
            if (isMobile && !(isEnabledOnMobile)) {
                console.log('Feature is disabled on mobile');
                return;
            }

            console.debug("Processing element", element);
            console.debug("context = ", context);

            console.debug(this.settings.rule);
            const rules = JSON.parse(this.settings.rule);

            for (const [pattern, urlTemplate] of Object.entries<string>(rules)) {
                applyRecursive(element, pattern, urlTemplate);
            }
        });

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new AutoHyperlinkSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		// this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		// 	console.log('click', evt);
		// });
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}


class AutoHyperlinkSettingTab extends PluginSettingTab {
	plugin: AutoHyperlinkPlugin;
    timeoutId: any;

	constructor(app: App, plugin: AutoHyperlinkPlugin) {
		super(app, plugin);
		this.plugin = plugin;
        this.timeoutId = null;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

        // only use headings under settings if you have more than one section
		// containerEl.createEl('h2', {text: 'Setting for AutoHyperlink'});
        let editorModeToggle = new Setting(containerEl)
            .setName('Enable feature on Editor View')
            .setDesc(
                'Experimental: enable the feature on Editor View. ' +
                'Please note that your text will be directly edited ' +
                'if you enable this mode. Also, you might encounter ' +
                'unexpected behavior as this is still experimental.'
            )
            .addToggle((toggle: ToggleComponent) => {
                toggle.setValue(this.plugin.settings.enableEditorMode);
                toggle.onChange(async (value: boolean) => {
                    this.plugin.settings.enableEditorMode = value;
                    await this.plugin.saveSettings();
                });
            });

        let mobileToggle = new Setting(containerEl)
            .setName('Enable on Mobile')
            .setDesc('Experimental: enable the feature on mobile app.')
            .addToggle((toggle: ToggleComponent) => {
                toggle.setValue(this.plugin.settings.enableMobile);
                toggle.onChange(async (value: boolean) => {
                    this.plugin.settings.enableMobile = value;
                    await this.plugin.saveSettings();
                });
            });

        let settingItem = new Setting(containerEl)
            .setName('Rule')
            .setDesc(
                'String must be JSON of "pattern":"urlTemplate" pairs, ' +
                'where urlTemplate can contain placeholder such as "$0" ' +
                'to embed matched string into url.'
            );

        let warningItem = new Setting(containerEl)
            .setDesc('');

        warningItem.descEl.setAttribute(
            'class',
            warningItem.descEl.getAttribute('class') + ' json-parse-error'
        );

        settingItem.addTextArea(textArea => {
            const currentValue = this.plugin.settings.rule;
            if (currentValue.length == 0 || currentValue == DEFAULT_SETTINGS.rule) {
                textArea.setPlaceholder('{"Obsidian": "obsidian.md"}');
            } else {
                textArea.setValue(currentValue);
            }

            if (!Platform.isMobile) {
                textArea.inputEl.rows = 10;
                const pxPerCols = textArea.inputEl.innerWidth / textArea.inputEl.cols;
                const pxPerRows = textArea.inputEl.innerHeight / textArea.inputEl.rows;

                let h = containerEl.innerHeight;
                let w = containerEl.innerWidth;
                console.log('pxPerCols = ', pxPerCols, ', w = ', w);
                console.log('pxPerRows = ', pxPerRows, ', h = ', h);
                textArea.inputEl.rows = Math.floor(h * 0.75 / pxPerRows);
                textArea.inputEl.cols = Math.floor(w * 0.4 / pxPerCols);
                console.log('resulting size: ', textArea.inputEl.rows, 'x', textArea.inputEl.cols);
            }

            let validate = async (value: string) => {
                // reset timeoutId
                this.timeoutId = null;

                console.log('rule JSON: ', value);
                this.plugin.settings.rule = value;
                try {
                    JSON.parse(this.plugin.settings.rule);
                } catch (error) {
                    warningItem.descEl.setText('JSON parse error. Please fix your rule.');
                    console.warn('JSON parse error. Falling back to default setting.');
                    this.plugin.settings.rule = DEFAULT_SETTINGS.rule;
                }
                await this.plugin.saveSettings();
            }

            // call validate when textArea becomes out of focus
            textArea.inputEl.addEventListener('focusout', async (e) => {
                warningItem.setDesc('');
                await validate(textArea.getValue());
            });

            return textArea
                .onChange(async (value) => {
                    warningItem.setDesc('');

                    // validate input lazily so that validation
                    // is not performed while user keeps typing
                    const LAZY_INTERVAL = 500;  // msec
                    if (this.timeoutId === null) {
                        console.log('register new validation');
                        this.timeoutId = setTimeout(validate, LAZY_INTERVAL, value);
                    } else {
                        console.log('renew validation interval');
                        clearTimeout(this.timeoutId);
                        this.timeoutId = setTimeout(validate, LAZY_INTERVAL, value);
                    }
                });
        });
    }
}
