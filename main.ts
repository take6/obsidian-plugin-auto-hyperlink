import { App, ButtonComponent, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TextAreaComponent } from 'obsidian';


interface AutoHyperlinkSettings {
	mySetting: string;
    rule: string;
}

const DEFAULT_SETTINGS: AutoHyperlinkSettings = {
	mySetting: 'default',
    rule: '[]'
}

export default class AutoHyperlinkPlugin extends Plugin {
	settings: AutoHyperlinkSettings;

	async onload() {
		await this.loadSettings();

        let applyConverter = (element: Text, pattern: string, urlTemplate: string) => {
            console.log("applyConverter");
            if (!element.textContent) {
                return;
            }

            let parent = element.parentElement;
            let regexStr = pattern;
            const regex = new RegExp(regexStr, 'g');
            let txt = element.textContent;
            let matches = txt.matchAll(regex);
            let txtStartIndex = 0;
            let converted = new Array<HTMLElement>();
            for (const match of matches) {
                console.log("Found ", match[0], " start=", match.index, " end=", match.index + match[0].length, "match.length = ", match.length);
                let a = document.createElement('a');
                a.textContent = match[0];
                let url = urlTemplate;
                for (let i = 0; i < match.length ; ++i) {
                    let x = "$" + i.toString();
                    url = url.replace(x, match[i]);
                    console.log("i = ", i, ", x = ", x, ", url=\"", url, "\"");
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
            console.log("converted = ", converted);
            if (converted.length > 0) {
                if (txtStartIndex < txt.length) {
                    const substr = txt.substring(txtStartIndex, txt.length);
                    console.log("tail = ", substr);
                    element.textContent = substr;
                } else {
                    element.textContent = "";
                }
                for (let x of converted) {
                    console.log("inserting ", x);
                    parent?.insertBefore(x, element);
                }
            }
        };

        let recursiveApply = (element: HTMLElement, pattern: string, urlTemplate: string) => {
            console.log("recursiveApply");
            console.log("element.nodeName = ", element.nodeName);
            const ignoreNodeList = ["A", "PRE"];
            if (element.nodeName == "A" || element.nodeName == "PRE") {
                console.log("ignoring ", element.nodeName);
                return;
            }

            for (let child of element.childNodes) {
                console.log("  Apply converter to child", child.nodeName);
                if (child.nodeName == "#text") {
                    // apply converter and continue
                    applyConverter(child, pattern, urlTemplate);
                    continue;
                } else {
                    recursiveApply(child, pattern, urlTemplate);
                }
            }
        };

        // post processing to insert external link
        this.registerMarkdownPostProcessor((element, context) => {
            console.log("Processing element", element);
            console.log("context = ", context);

            console.log(this.settings.rule);
            const converterList = JSON.parse(this.settings.rule);

            for (const pattern of Object.keys(converterList)) {
                // const pattern = converter["pattern"];
                const urlTemplate = converterList[pattern];
                recursiveApply(element, pattern, urlTemplate);
            }
        });

		// Add another icon - This creates an icon in the left ribbon.
		const birdIconEl = this.addRibbonIcon('bird', 'AutoHyperlinkPlugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('Chirp!\n Current autolink rule is \n' + this.settings.rule, 0);
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new AutoHyperlinkSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});
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

	constructor(app: App, plugin: AutoHyperlinkPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Setting for AutoHyperlink'});

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
                return TextArea
                    .onChange(async (value) => {
                        console.log('rule JSON: ', value);
                        this.plugin.settings.rule = value;
                        try {
                            JSON.parse(this.plugin.settings.rule);
                        } catch (error) {
                            console.warn('JSON parse error. Falling back to default setting.');
                            this.plugin.settings.rule = DEFAULT_SETTINGS.rule;
                        }
                        await this.plugin.saveSettings();
                    });
            });
    }
}
