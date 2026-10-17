#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

// Верафьора: the raised hand catches a projectile in a lightning shield;
// blue charge runs around her silhouette and leaves her extended right hand.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0 - smoothstep(0.55, 1.0, length((p-c)/r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.0,1.0));
}
float wire(vec2 p, vec2 a, vec2 b, float aa) {
    float d=segment(p,a,b);
    return 1.0-smoothstep(0.001,0.0025+aa*0.75,d);
}
vec2 route(float q) {
    if(q<0.2) return mix(vec2(0.071,0.280),vec2(0.181,0.342),q*5.0);
    if(q<0.4) return mix(vec2(0.181,0.342),vec2(0.280,0.469),(q-0.2)*5.0);
    if(q<0.6) return mix(vec2(0.280,0.469),vec2(0.497,0.477),(q-0.4)*5.0);
    if(q<0.8) return mix(vec2(0.497,0.477),vec2(0.644,0.449),(q-0.6)*5.0);
    return mix(vec2(0.644,0.449),vec2(0.803,0.436),(q-0.8)*5.0);
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 original=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173)*6.283185;
    float art=smoothstep(0.138,0.150,p.y)*(1.0-smoothstep(0.542,0.553,p.y));
    art*=smoothstep(0.008,0.025,p.x)*(1.0-smoothstep(0.970,0.989,p.x));
    // Keep the entire shield icon and its separate numerical counter intact.
    art*=smoothstep(0.97,1.13,length((p-vec2(0.108,0.183))/vec2(0.063,0.041)));
    art*=smoothstep(0.96,1.20,length((p-vec2(0.151,0.207))/vec2(0.027,0.020)));
    vec3 col=original.rgb;
    float cyan=smoothstep(0.03,0.23,original.b-original.r)
              *smoothstep(0.20,0.60,original.g);
    // The painted cyan aura carries wide, plainly travelling waves.
    float wave=pow(0.5+0.5*sin(p.y*46.0-p.x*18.0-t*4.2+seed),4.0);
    float aura=oval(p,vec2(0.27,0.36),vec2(0.25,0.23))
              +oval(p,vec2(0.68,0.38),vec2(0.30,0.14));
    col+=vec3(0.025,0.26,0.35)*cyan*min(aura,1.0)*(0.10+wave*0.72);

    // Shield crescent surrounds the upraised hand, below the printed badge.
    vec2 shield=(p-vec2(0.105,0.288))*vec2(1.0,1.42);
    float angle=atan(shield.y,shield.x);
    float radius=0.112+0.006*sin(angle*7.0-t*4.0+seed);
    float ringD=abs(length(shield)-radius);
    float shieldRing=(1.0-smoothstep(0.0015,0.004+aa,ringD))
                   *smoothstep(0.221,0.244,p.y);
    float movingArc=pow(0.5+0.5*cos(angle-t*2.7+seed),5.0);
    col+=vec3(0.12,0.58,0.77)*shieldRing*(0.20+movingArc*0.75);
    col+=vec3(0.015,0.16,0.23)*exp(-ringD/0.018)*movingArc;
    // A moving orange projectile is caught from the left; a longer blue
    // discharge leaves the other palm toward the open mountain scenery.
    float cycle=fract(t*0.43+seed*0.09);
    float incoming=clamp(cycle/0.32,0.0,1.0);
    vec2 tip=mix(vec2(0.019,0.435),vec2(0.078,0.299),incoming);
    float inFade=(1.0-smoothstep(0.30,0.36,cycle))*smoothstep(0.0,0.06,cycle);
    float streak=wire(p,tip,tip+vec2(-0.018,0.047),aa)*inFade;
    col+=vec3(0.80,0.38,0.08)*streak;
    float catchFlash=exp(-pow((cycle-0.33)/0.065,2.0));
    col+=vec3(0.12,0.51,0.63)*oval(p,vec2(0.078,0.299),vec2(0.047,0.038))*catchFlash;

    float packets=0.0;
    for(int i=0;i<4;i++) {
        float q=fract(t*0.54+float(i)*0.25+seed*0.03);
        vec2 at=route(q);
        vec2 behind=route(max(q-0.060,0.0));
        float fade=smoothstep(0.0,0.07,q)*(1.0-smoothstep(0.91,1.0,q));
        packets+=wire(p,at,behind+vec2(0.0001),aa)*fade;
    }
    col+=vec3(0.12,0.59,0.80)*packets*0.75;
    float pulse=0.20+0.80*pow(0.5+0.5*sin(t*5.4+seed),3.0);
    // Angular discharge wiggles only in the background beyond her fingers.
    vec2 a=vec2(0.805,0.434);
    vec2 b=vec2(0.864,0.411+0.009*sin(t*7.0+seed));
    vec2 c=vec2(0.848,0.390+0.007*cos(t*6.0));
    vec2 d=vec2(0.919,0.365+0.008*sin(t*5.0+seed));
    vec2 e=vec2(0.963,0.327);
    float bolt=wire(p,a,b,aa)+wire(p,b,c,aa)+wire(p,c,d,aa)+wire(p,d,e,aa);
    col+=vec3(0.20,0.62,0.83)*min(bolt,1.0)*pulse;
    col+=vec3(0.03,0.27,0.38)*oval(p,a,vec2(0.067,0.034))*pulse;

    if(u_is_foil) {
        // Cyan electricity and silver windblown hair receive a saturated
        // prismatic metal finish that remains present with time frozen at 0.
        float lum=dot(original.rgb,vec3(0.2126,0.7152,0.0722));
        float hair=oval(p,vec2(0.668,0.323),vec2(0.23,0.085));
        float phase=p.x*1.8+p.y*2.5+0.12*sin(p.x*23.0-p.y*15.0)-t*0.14+seed*0.05;
        vec3 hue=0.5+0.5*cos(6.283185*(phase+vec3(0.0,0.333,0.667)));
        vec3 overlay=mix(2.0*col*hue,1.0-2.0*(1.0-col)*(1.0-hue),step(vec3(0.5),col));
        float finish=0.28+0.22*cyan+0.16*hair;
        col=mix(col,overlay,finish);
        float glint=pow(0.5+0.5*sin(p.x*31.0+p.y*24.0-t*1.5+seed),14.0);
        col+=(1.0-col)*(0.10+0.24*hue)*glint*smoothstep(0.22,0.65,lum)*(0.4+hair+cyan*0.4);
    }
    gl_FragColor=vec4(mix(original.rgb,clamp(col,0.0,1.0),art),original.a);
}
