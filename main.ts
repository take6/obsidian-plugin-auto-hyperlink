import { App, ButtonComponent, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TextAreaComponent } from 'obsidian';


interface AutoHyperlinkSettings {
    rule: string;
}

const DEFAULT_SETTINGS: AutoHyperlinkSettings = {
    rule: '[]'
}

export default class AutoHyperlinkPlugin extends Plugin {
	settings: AutoHyperlinkSettings;

	async onload() {
		await this.loadSettings();

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
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

        // only use headings under settings if you have more than one section
		// containerEl.createEl('h2', {text: 'Setting for AutoHyperlink'});

        new Setting(containerEl)
            .setName('Rule')
            .setDesc(
                'String must be JSON of "pattern":"urlTemplate" pairs, ' +
                'where urlTemplate can contain placeholder such as "$0" ' +
                'to embed matched string into url.'
            )
            .addTextArea(textArea => {
                const currentValue = this.plugin.settings.rule;
                if (currentValue.length == 0 || currentValue == DEFAULT_SETTINGS.rule) {
                    textArea.setPlaceholder('{"Obsidian": "obsidian.md"}');
                } else {
                    textArea.setValue(currentValue);
                }

                let validate = async (value: string) => {
                    // reset timeoutId
                    this.timeoutId = undefined;

                    console.log('rule JSON: ', value);
                    this.plugin.settings.rule = value;
                    try {
                        JSON.parse(this.plugin.settings.rule);
                    } catch (error) {
                        console.warn('JSON parse error. Falling back to default setting.');
                        this.plugin.settings.rule = DEFAULT_SETTINGS.rule;
                    }
                    await this.plugin.saveSettings();
                }

                // call validate when textArea becomes out of focus
                textArea.inputEl.addEventListener('focusout', async (e) => {
                    await validate(textArea.getValue());
                })

                return textArea
                    .onChange(async (value) => {
                        // validate input lazily so that validation
                        // is not performed while user keeps typing
                        const LAZY_INTERVAL = 500;  // msec
                        if (!this.timeoutId) {
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
