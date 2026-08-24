"""
generate_site.py
-----------------
Static-site generator for the Nikolay portfolio site.

Unlike the "Digital Craft" example this was modeled after, this site is a
SINGLE page (index.html), not a set of per-item collection pages. So there
is only one template (template.html) and one output file (public/index.html).

Data sources (swap the loader functions below for Firestore reads later):
  data/art_direction_projects.json   -> "Art Direction" project cards (WORKS_DATA)
  data/art_direction_extra.json      -> placeholder text + discipline backdrops/labels
  data/photo_gallery.json            -> Photography accordion categories + items
  data/site.json (optional)          -> meta/SEO fields (title, description, og:image...)

Usage:
    pip install jinja2
    python generate_site.py
"""
import json
import os
import shutil
import hashlib
from jinja2 import Environment, FileSystemLoader

OUTPUT_DIR = "public"


def static_asset_version(filename):
    """Content hash used as a ?v= cache-busting query param."""
    try:
        with open(filename, "rb") as f:
            return hashlib.md5(f.read()).hexdigest()[:8]
    except FileNotFoundError:
        return "1"


def get_firestore_data():
    """
    Optional: build the site straight from Firestore instead of local JSON.
    This is what you'd call from a GitHub Actions workflow so the site
    rebuilds whenever the admin panel (admin.html) changes something.

    Requires:
        pip install firebase-admin
        A SERVICE ACCOUNT key (Firebase Console > Project Settings >
        Service Accounts > Generate new private key). This is DIFFERENT
        from the public web apiKey used in firebase-config.js — never
        commit the service account JSON to the repo; pass it via a
        GitHub Actions secret instead.

    Reads exactly the schema seed.html writes:
        artDirectionProjects/{discipline}-{num}   (field "discipline")
        photoGallery/{category}-{nn}              (field "category")
        config/site
        config/artDirectionExtra
    """
    import firebase_admin
    from firebase_admin import credentials, firestore

    if not firebase_admin._apps:
        cred = credentials.Certificate(os.environ["FIREBASE_SERVICE_ACCOUNT_JSON"])
        firebase_admin.initialize_app(cred)
    db = firestore.client()

    works_data = {}
    for doc in db.collection("artDirectionProjects").order_by("order").stream():
        d = doc.to_dict()
        specs = d.get("specs") or []
        d["specs"] = [[s.get("label", ""), s.get("value", "")] if isinstance(s, dict) else s for s in specs]
        works_data.setdefault(d.get("discipline", "web"), []).append(d)

    photo_categories_map = {}
    for doc in db.collection("photoGallery").order_by("order").stream():
        d = doc.to_dict()
        slug = d.get("category", "uncategorized")
        cat = photo_categories_map.setdefault(slug, {
            "slug": slug,
            "label_i18n": d.get("categoryLabelKey", f"photo.cat.{slug}"),
            "photos": [],
        })
        cat["photos"].append({
            "image": d.get("image", ""),
            "title": {"i18n": d.get("titleKey"), "default": d.get("title", "")},
            "location": {"i18n": d.get("locationKey"), "default": d.get("location", "")},
            "camera": d.get("camera", ""),
            "lens": d.get("lens", ""),
            "year": d.get("year", ""),
        })
    photo_categories = list(photo_categories_map.values())

    site_doc = db.collection("config").document("site").get()
    site = site_doc.to_dict() if site_doc.exists else {}
    # generate_site.py's template uses snake_case-ish base_url/og_image keys
    site = {
        "title": site.get("title"), "description": site.get("description"),
        "author": site.get("author"), "base_url": site.get("baseUrl"),
        "og_description": site.get("ogDescription"), "og_image": site.get("ogImage"),
    }

    extra_doc = db.collection("config").document("artDirectionExtra").get()
    extra_raw = extra_doc.to_dict() if extra_doc.exists else {}
    extra = {
        "AD_PM_DESC_PLACEHOLDER": extra_raw.get("AD_PM_DESC_PLACEHOLDER", ""),
        "DISCIPLINE_BACKDROPS": extra_raw.get("DISCIPLINE_BACKDROPS", {}),
        "DISCIPLINE_LABELS": extra_raw.get("DISCIPLINE_LABELS", {}),
    }

    return {"works_data": works_data, "extra": extra, "photo_categories": photo_categories, "site": site}


def load_json(path, default):
    if not os.path.exists(path):
        print(f"  ! Missing {path}, using default")
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_all_data():
    """
    Replace this with Firestore reads, e.g.:

        from firebase_admin import firestore
        db = firestore.client()
        works = {}
        for doc in db.collection('artDirectionProjects').stream():
            d = doc.to_dict()
            works.setdefault(d['discipline'], []).append(d)

    For now it reads the local JSON seed files in ./data, which are also
    exactly what you'd upload to Firestore to seed the database. Set
    USE_FIRESTORE=1 (with FIREBASE_SERVICE_ACCOUNT_JSON pointing at a
    service-account key file) to build from live Firestore data instead.
    """
    if os.environ.get("USE_FIRESTORE") == "1":
        return get_firestore_data()

    works_data = load_json("data/art_direction_projects.json", {})
    extra = load_json(
        "data/art_direction_extra.json",
        {"AD_PM_DESC_PLACEHOLDER": "", "DISCIPLINE_BACKDROPS": {}, "DISCIPLINE_LABELS": {}},
    )
    photo_categories = load_json("data/photo_gallery.json", [])
    site = load_json("data/site.json", {})

    # normalize photo item title/location into {i18n, default} the template expects
    for cat in photo_categories:
        cat.setdefault("label_default", None)
        for item in cat.get("photos", []):
            for field in ("title", "location"):
                val = item.get(field)
                if isinstance(val, str):
                    item[field] = {"i18n": None, "default": val}

    return {
        "works_data": works_data,
        "extra": extra,
        "photo_categories": photo_categories,
        "site": site,
    }


def main():
    print("--- Building site ---")
    if os.path.exists(OUTPUT_DIR):
        shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    data = get_all_data()

    env = Environment(loader=FileSystemLoader("."))
    template = env.get_template("template.html")

    html = template.render(
        site=data["site"],
        photo_categories=data["photo_categories"],
        works_data_json=json.dumps(data["works_data"], ensure_ascii=False),
        ad_pm_desc_placeholder_json=json.dumps(data["extra"].get("AD_PM_DESC_PLACEHOLDER", ""), ensure_ascii=False),
        discipline_backdrops_json=json.dumps(data["extra"].get("DISCIPLINE_BACKDROPS", {}), ensure_ascii=False),
        discipline_labels_json=json.dumps(data["extra"].get("DISCIPLINE_LABELS", {}), ensure_ascii=False),
        main_js_v=static_asset_version("main.js"),
        styles_css_v=static_asset_version("styles.css"),
    )

    with open(os.path.join(OUTPUT_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)
    print(f"  ✓ {OUTPUT_DIR}/index.html written ({len(html):,} chars)")

    # Copy static assets untouched (design/functionality, not "data")
    ignore = {
        ".git", OUTPUT_DIR, "generate_site.py", "template.html", "data",
        "__pycache__",
    }
    for name in os.listdir("."):
        if name in ignore:
            continue
        src = os.path.join(".", name)
        dst = os.path.join(OUTPUT_DIR, name)
        if os.path.isfile(src):
            shutil.copy2(src, dst)
        elif os.path.isdir(src):
            shutil.copytree(src, dst, dirs_exist_ok=True)
    print("  ✓ static assets copied")
    print("--- Done ---")


if __name__ == "__main__":
    main()
