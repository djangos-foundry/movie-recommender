# Controling Backdrop
All backdrop styling and hero positioning are located in `frontend/src/index.css`

## A. Bringing the Poster & Overview Down (To Reveal More Backdrop)
The overlap of the poster and details over the backdrop is controlled by a negative top margin on `.mdp-hero-content`

```css
.mdp-hero-content {
  display: flex;
  align-items: flex-end;
  gap: 32px;
  max-width: 1540px;
  width: 100%;
  margin: -260px auto 0;  /* <--- CHANGE THIS VALUE */
  padding: 0 48px;
  position: relative;
  z-index: 10;
}
```
- Values to try:
    - Currently it is -260px (which pulls the poster up by 260px into the image).
    - Change to -160px or -100px to push the card down and show much more of the backdrop above it.
    - Setting it to 0 or positive margin: 20px auto 0; will place the poster completely below the backdrop.
- Optionally increase the total backdrop height: In frontend/src/index.css:

```css
.mdp-backdrop-wrap {
  position: relative;
  width: 100%;
  height: 520px;  /* <--- Try increasing to 600px, 680px, or 60vh */
  overflow: hidden;
  flex-shrink: 0;
  margin-top: -54px;
}
```
## B. Centering the Picture Focus on the Backdrop Image
In `frontend/src/index.css`:

```css
.mdp-backdrop-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;  /* <--- CURRENTLY SET TO TOP */
  opacity: 0.82;
  display: block;
}
```

- Values to try for object-position:
    - object-position: center center; (or simply center;) — Centers both horizontally and vertically.
    - object-position: center 35%; — Slightly above exact center (often great for human faces).
    - object-position: 50% 50%; — Standard coordinate syntax (X Y).
## C. Controlling the Bottom Fade
In `frontend/src/index.css`:

```css
/* Bottom fade — only covers lowest ~30% so 70%+ of image is fully visible */
.mdp-backdrop-fade-bottom {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    #0d0d0d 0%,
    #0d0d0d 4%,
    rgba(13,13,13,0.88) 14%,
    rgba(13,13,13,0.45) 24%,
    rgba(13,13,13,0.08) 36%,
    transparent 48%   /* <--- FADE END POINT */
  );
}
```

- **How to adjust the bottom fade**:
    - **To make the fade shorter** (showing more image at the bottom): Lower the end percentage, for example stop at 25%:
        ```css
        background: linear-gradient(
        to top,
        #0d0d0d 0%,
        rgba(13,13,13,0.7) 10%,
        transparent 25%
        );
        ```
- **To make the fade softer & taller (blends smoothly across more of the height)**: Extend `transparent` to 65% or 75%.
- **To make the fade less opaque overall**: Add `opacity: 0.7;` directly to `.mdp-backdrop-fade-bottom`.
- **To remove it entirely while testing**: Temporarily add `display: none;` or comment out `<div className="mdp-backdrop-fade-bottom" />` in `MovieDetailPage.jsx:L180`.