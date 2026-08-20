import pytest

from app.services.link_preview_metadata import LinkPreviewMetadataParser


PARSER = LinkPreviewMetadataParser()
FINAL_URL = "https://example.org/articles/town"


@pytest.mark.parametrize(
    ("head", "expected"),
    [
        (
            '<meta property="og:title" content=" OG title "><meta name="twitter:title" content="Twitter title"><title>Document title</title>',
            "OG title",
        ),
        (
            '<meta name="twitter:title" content="Twitter title"><title>Document title</title>',
            "Twitter title",
        ),
        ('<title>Document title</title>', "Document title"),
    ],
)
def test_title_precedence(head, expected):
    parsed = PARSER.parse(f"<html><head>{head}</head></html>".encode(), final_url=FINAL_URL)
    assert parsed.title == expected


@pytest.mark.parametrize(
    ("head", "expected"),
    [
        (
            '<meta property="og:description" content="OG description"><meta name="twitter:description" content="Twitter description"><meta name="description" content="Standard description">',
            "OG description",
        ),
        (
            '<meta name="twitter:description" content="Twitter description"><meta name="description" content="Standard description">',
            "Twitter description",
        ),
        ('<meta name="description" content="Standard description">', "Standard description"),
    ],
)
def test_description_precedence(head, expected):
    parsed = PARSER.parse(f"<html><head>{head}</head></html>".encode(), final_url=FINAL_URL)
    assert parsed.description == expected


def test_plain_text_sanitization_and_relative_metadata():
    parsed = PARSER.parse(
        b"""
        <html><head>
          <meta property="og:title" content="  Town &amp; River  ">
          <meta property="og:description" content="Meet &lt;b&gt;neighbors&lt;/b&gt; &nbsp; today">
          <meta property="og:site_name" content="  The &amp; Bend  ">
          <meta property="og:url" content="/events/1#section">
          <meta property="og:image" content="../images/event.jpg">
        </head></html>
        """,
        final_url=FINAL_URL,
    )
    assert parsed.title == "Town & River"
    assert parsed.description == "Meet neighbors today"
    assert parsed.site_name == "The & Bend"
    assert parsed.destination_candidate == "https://example.org/events/1#section"
    assert parsed.image_candidates == ("https://example.org/images/event.jpg",)


def test_site_name_falls_back_to_final_hostname_and_title_can_be_missing():
    parsed = PARSER.parse(b"<html><head><title>   </title></head></html>", final_url=FINAL_URL)
    assert parsed.title is None
    assert parsed.site_name == "example.org"


def test_text_is_collapsed_and_sliced_by_python_characters():
    parsed = PARSER.parse(
        (
            "<title>\u2003A\n B " + "x" * 200 + "</title>"
            '<meta name="description" content="\tA\u00a0 B ' + "y" * 400 + '">'
            '<meta property="og:site_name" content=" C  D ' + "z" * 100 + '">'
        ).encode(),
        final_url=FINAL_URL,
    )
    assert len(parsed.title) == 180
    assert parsed.title == "A B " + "x" * 176
    assert len(parsed.description) == 300
    assert parsed.description == "A B " + "y" * 296
    assert len(parsed.site_name) == 80
    assert parsed.site_name == "C D " + "z" * 76


def test_image_candidates_follow_metadata_structured_and_page_order():
    parsed = PARSER.parse(
        b"""
        <html><head>
          <meta property="og:image" content="/og.jpg">
          <meta property="og:image:secure_url" content="/secure.jpg">
          <meta name="twitter:image" content="/twitter.jpg">
          <link rel="image_src" href="/image-src.jpg">
          <script type="application/ld+json">{"image": ["/structured.jpg"], "logo": {"url": "/logo-data.jpg"}}</script>
        </head><body>
          <img class="hero" src="/hero.jpg">
          <main><img src="/main.jpg"></main>
          <link rel="icon" href="/favicon.ico">
        </body></html>
        """,
        final_url=FINAL_URL,
    )
    assert parsed.image_candidates == (
        "https://example.org/secure.jpg",
        "https://example.org/og.jpg",
        "https://example.org/twitter.jpg",
        "https://example.org/image-src.jpg",
    )


def test_structured_data_string_and_object_forms_are_candidates():
    parsed = PARSER.parse(
        b"""
        <script type="application/ld+json">[
          {"@type": "Article", "image": "/article.jpg"},
          {"@type": "Organization", "logo": {"@type": "ImageObject", "contentUrl": "/brand.jpg"}}
        ]</script>
        """,
        final_url=FINAL_URL,
    )
    assert parsed.image_candidates == (
        "https://example.org/article.jpg",
        "https://example.org/brand.jpg",
    )


def test_qualified_fallbacks_precede_main_content_and_icon():
    parsed = PARSER.parse(
        b"""
        <html><head><link rel="shortcut icon" href="/favicon.ico"></head><body>
          <img alt="brand mark" src="/brand.png">
          <img class="banner-image" src="/banner.png">
          <article><img src="/article.png"></article>
          <img class="icon" src="/icon.png">
        </body></html>
        """,
        final_url=FINAL_URL,
    )
    assert parsed.image_candidates == (
        "https://example.org/brand.png",
        "https://example.org/banner.png",
        "https://example.org/article.png",
        "https://example.org/favicon.ico",
    )


def test_rejects_hidden_empty_data_svg_tiny_tracking_and_non_http_candidates():
    parsed = PARSER.parse(
        b"""
        <meta property="og:image" content="data:image/png;base64,abc">
        <meta name="twitter:image" content="https://example.org/icon.svg">
        <img hidden src="/hidden.jpg"><img style="display: none" src="/style-hidden.jpg">
        <img src=""><img src="data:image/png;base64,abc"><img src="/vector.svg">
        <img width="1" height="1" src="/pixel.jpg"><img class="tracking-pixel" src="/track.jpg">
        <main><img src="mailto:image@example.org"><img src="//example.org/valid.jpg"></main>
        """,
        final_url=FINAL_URL,
    )
    assert parsed.image_candidates == ("https://example.org/valid.jpg",)


def test_deduplicates_stably_and_caps_candidates_at_four():
    parsed = PARSER.parse(
        b"""
        <meta property="og:image:secure_url" content="/one.jpg">
        <meta property="og:image" content="/one.jpg">
        <meta name="twitter:image" content="/two.jpg">
        <link rel="image_src" href="/three.jpg">
        <script type="application/ld+json">{"image": "/four.jpg"}</script>
        <img class="hero" src="/five.jpg"><img class="hero" src="/six.jpg">
        """,
        final_url=FINAL_URL,
    )
    assert parsed.image_candidates == tuple(
        f"https://example.org/{name}.jpg" for name in ("one", "two", "three", "four")
    )


def test_inspects_at_most_32_img_elements():
    html = "<main>" + "".join(f'<img src="/ignored-{index}.jpg">' for index in range(32)) + "</main>"
    html += '<img class="hero" src="/thirty-three.jpg">'
    parsed = PARSER.parse(html.encode(), final_url=FINAL_URL)
    assert "https://example.org/thirty-three.jpg" not in parsed.image_candidates
    assert len(parsed.image_candidates) == 4


def test_malformed_html_and_json_ld_never_crash():
    parsed = PARSER.parse(
        b"<title><b>Open title<meta property='og:image' content='/image.jpg'><script type='application/ld+json'>{bad",
        final_url=FINAL_URL,
    )
    assert parsed.title == "Open title"
    assert parsed.image_candidates == ()


def test_duplicate_metadata_skips_empty_or_unusable_values_before_valid_values():
    parsed = PARSER.parse(
        b"""
        <meta property="og:title" content="   ">
        <meta property="og:title" content="Usable title">
        <meta property="og:image" content="data:image/png;base64,broken">
        <meta property="og:image" content="/usable.jpg">
        <meta property="og:url" content="mailto:nope@example.org">
        <meta property="og:url" content="/canonical">
        """,
        final_url=FINAL_URL,
    )
    assert parsed.title == "Usable title"
    assert parsed.image_candidates == ("https://example.org/usable.jpg",)
    assert parsed.destination_candidate == "https://example.org/canonical"


def test_svg_and_data_candidates_are_rejected_from_every_source_with_fragments():
    parsed = PARSER.parse(
        b"""
        <meta property="og:image" content="/vector.svg#hero">
        <meta name="twitter:image" content="data:image/png;base64,abc">
        <script type="application/ld+json">{"image": "/structured.svg#x", "logo": "/logo.png"}</script>
        <main><img src="/inline.svg#x"><img src="/valid.jpg"></main>
        <link rel="icon" href="/favicon.svg#x">
        <link rel="icon" href="/favicon.png">
        """,
        final_url=FINAL_URL,
    )
    assert parsed.image_candidates == (
        "https://example.org/logo.png",
        "https://example.org/valid.jpg",
        "https://example.org/favicon.png",
    )


def test_generic_images_are_omitted_and_icon_inside_article_is_last():
    parsed = PARSER.parse(
        b"""
        <img src="/generic.jpg">
        <article><img class="icon" src="/article-icon.jpg"><img src="/article.jpg"></article>
        <link rel="icon" href="/favicon.ico">
        """,
        final_url=FINAL_URL,
    )
    assert parsed.image_candidates == (
        "https://example.org/article.jpg",
        "https://example.org/favicon.ico",
        "https://example.org/article-icon.jpg",
    )


def test_deep_and_broad_json_ld_are_bounded_and_never_crash():
    deep = '{"image": ' + ("{" * 1100) + '"/deep.jpg"' + ("}" * 1100) + "}"
    broad = '{"image": ["/first.jpg", ' + ",".join('"/extra-%s.jpg"' % i for i in range(200)) + "]}"
    parsed = PARSER.parse(
        (f'<script type="application/ld+json">{deep}</script><script type="application/ld+json">{broad}</script>').encode(),
        final_url=FINAL_URL,
    )
    assert parsed.image_candidates[0] == "https://example.org/first.jpg"
    assert len(parsed.image_candidates) == 4


@pytest.mark.parametrize(
    "attributes",
    [
        'style="width:1px;height:1px"',
        'width="1px" height="1px"',
        'width="2.0" height="100"',
    ],
)
def test_tiny_css_and_unit_dimensions_do_not_consume_image_slots(attributes):
    parsed = PARSER.parse(
        f'<main><img src="/tiny.jpg" {attributes}><img src="/usable.jpg"></main>'.encode(),
        final_url=FINAL_URL,
    )
    assert parsed.image_candidates == ("https://example.org/usable.jpg",)
