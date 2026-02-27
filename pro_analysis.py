import os
import glob
import re

PLUGIN_DIR = "/Users/toshinoriishibashi/Desktop/ULTRA/options-toolkit/plugins"

def get_plugins():
    # Find all .md files in commands directories
    paths = glob.glob(os.path.join(PLUGIN_DIR, "**/commands/*.md"), recursive=True)
    plugins = []
    for p in paths:
        with open(p, 'r') as f:
            content = f.read()
            # Extract description from frontmatter
            desc_match = re.search(r'description:\s*(.*)', content)
            desc = desc_match.group(1) if desc_match else "No description available"
            plugins.append({
                'name': os.path.basename(p).replace('.md', '').capitalize(),
                'desc': desc,
                'path': p
            })
    return plugins

def run_workflow(plugin):
    print(f"\n🚀 Running Workflow: {plugin['name']}")
    print(f"Description: {plugin['desc']}\n")
    
    with open(plugin['path'], 'r') as f:
        content = f.read()
        
    # Find the Workflow section
    workflow_match = re.search(r'## Workflow(.*?)(?:##|$)', content, re.DOTALL)
    if not workflow_match:
        print("❌ No workflow steps found in this plugin.")
        return

    workflow_text = workflow_match.group(1).strip()
    steps = re.split(r'### Step \d+:', workflow_text)
    
    for i, step in enumerate(steps):
        if not step.strip(): continue
        print(f"--- Step {i} ---")
        print(step.strip())
        input("\n[Press Enter to proceed to the next step...]")

def main():
    print("🏦 Pro Financial Services Plugin Runner")
    print("Analyzing Anthropic Financial Services Plugins repository...")
    
    plugins = get_plugins()
    if not plugins:
        print("❌ No plugins found. Ensure the repo is cloned in the plugins/ directory.")
        return

    while True:
        print("\nAvailable Institutional Workflows:")
        for i, p in enumerate(plugins):
            print(f"{i+1}. {p['name']} - {p['desc']}")
        
        choice = input("\nSelect a plugin # to run (or 'q' to quit): ")
        if choice.lower() == 'q':
            break
            
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(plugins):
                run_workflow(plugins[idx])
            else:
                print("❌ Invalid selection.")
        except ValueError:
            print("❌ Please enter a number.")

if __name__ == "__main__":
    main()
