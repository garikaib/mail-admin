#!/usr/bin/env python3
"""
Clean up old mail folders:
1. Copy contents of .spam to .Junk
2. Delete .spam, .Mailspring, .Mailspring.Snoozed folders
"""

import subprocess
import os

def run(cmd):
    print(f"Running: {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0 and result.stderr:
        print(f"  Warning: {result.stderr.strip()}")
    return result.returncode == 0

def main():
    vmail_base = "/var/vmail"
    
    # Find all .spam folders
    result = subprocess.run(
        f"find {vmail_base} -type d -name '.spam'",
        shell=True, capture_output=True, text=True
    )
    spam_folders = [f.strip() for f in result.stdout.strip().split('\n') if f.strip()]
    
    print(f"\n=== Found {len(spam_folders)} .spam folders ===")
    
    for spam_folder in spam_folders:
        user_dir = os.path.dirname(spam_folder)
        junk_folder = os.path.join(user_dir, ".Junk")
        
        # Create Junk folder if it doesn't exist
        if not os.path.exists(junk_folder):
            os.makedirs(junk_folder, exist_ok=True)
            print(f"✓ Created {junk_folder}")
        
        # Check for mail in spam folder (in cur/ or new/)
        spam_cur = os.path.join(spam_folder, "cur")
        spam_new = os.path.join(spam_folder, "new")
        junk_cur = os.path.join(junk_folder, "cur")
        junk_new = os.path.join(junk_folder, "new")
        
        # Create subdirs in Junk
        os.makedirs(junk_cur, exist_ok=True)
        os.makedirs(junk_new, exist_ok=True)
        os.makedirs(os.path.join(junk_folder, "tmp"), exist_ok=True)
        
        # Copy mail from spam to Junk
        if os.path.exists(spam_cur):
            run(f"cp -n {spam_cur}/* {junk_cur}/ 2>/dev/null")
        if os.path.exists(spam_new):
            run(f"cp -n {spam_new}/* {junk_new}/ 2>/dev/null")
        
        print(f"✓ Merged {spam_folder} → {junk_folder}")
        
        # Delete spam folder
        run(f"rm -rf '{spam_folder}'")
        print(f"✓ Deleted {spam_folder}")
    
    # Find and delete Mailspring folders
    print("\n=== Removing Mailspring folders ===")
    result = subprocess.run(
        f"find {vmail_base} -type d -name '.Mailspring*'",
        shell=True, capture_output=True, text=True
    )
    mailspring_folders = [f.strip() for f in result.stdout.strip().split('\n') if f.strip()]
    
    for folder in mailspring_folders:
        run(f"rm -rf '{folder}'")
        print(f"✓ Deleted {folder}")
    
    # Fix ownership
    print("\n=== Fixing ownership ===")
    run(f"chown -R vmail:vmail {vmail_base}")
    
    print("\n✅ Cleanup complete!")

if __name__ == "__main__":
    main()
