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

// Арзель: Сот's gift charges the jeweled staff, then discharges into her palm.
// All locations refer to the original illustration, in top-left coordinates.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.0,1.0,length((p-c)/r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/max(dot(d,d),0.000001),0.0,1.0));
}
float hash(float x) { return fract(sin(x*127.1+19.7)*43758.5453); }
vec2 staff(float f) {
    float x=0.395-0.052*sin(f*3.141593)+0.045*f*f;
    return vec2(x,0.175+0.338*f);
}

void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=u_time;
    float seed=fract(u_seed*0.137);
    float art=smoothstep(0.138,0.149,p.y)*(1.0-smoothstep(0.538,0.548,p.y));
    art*=smoothstep(0.003,0.017,p.x)*(1.0-smoothstep(0.982,0.997,p.x));
    // Preserve the shield and the upper-right faction emblem including halos.
    art*=smoothstep(0.073,0.092,length((p-vec2(0.111,0.180))*vec2(1.0,1.42)));
    art*=smoothstep(0.084,0.102,length((p-vec2(0.880,0.082))*vec2(1.0,1.42)));
    vec3 color=scan.rgb;
    float beat=0.5+0.5*sin(t*2.1+seed*6.2831853);
    float discharge=pow(beat,7.0);
    float face=oval(p,vec2(0.711,0.220),vec2(0.073,0.082));

    // Two narrow, irregular filaments wrap the painted jeweled staff. Their
    // traveling bright nodes make the spell legible even without foil enabled.
    float wire=0.0;
    float aura=0.0;
    for (int i=0;i<16;i++) {
        float f=float(i)/16.0;
        float g=(float(i)+1.0)/16.0;
        vec2 a=staff(f);
        vec2 b=staff(g);
        a.x+=0.009*sin(f*79.0+t*3.2+seed*9.0)*sin(f*3.141593);
        b.x+=0.009*sin(g*79.0+t*3.2+seed*9.0)*sin(g*3.141593);
        float d=segment(p,a,b);
        float packet=pow(0.5+0.5*cos(f*13.0-t*3.5+seed*6.0),10.0);
        float power=0.24+0.65*packet+0.32*discharge;
        wire+=power*(1.0-smoothstep(0.0011,0.0020+aa*0.65,d));
        aura+=power*exp(-d*d/0.00020)*0.28;
    }
    color+=vec3(0.07,0.26,0.40)*aura;
    color+=vec3(0.32,0.77,0.94)*min(wire,1.5);

    // Arc jumps from the lower staff tip across the outstretched fingers.
    float palmArc=0.0;
    vec2 a=vec2(0.440,0.513);
    for (int i=0;i<6;i++) {
        float f=(float(i)+1.0)/6.0;
        vec2 b=mix(vec2(0.440,0.513),vec2(0.573,0.526),f);
        b.y+=sin(f*36.0+t*8.0)*0.010*sin(f*3.141593);
        palmArc+=1.0-smoothstep(0.0009,0.0018+aa*0.7,segment(p,a,b));
        a=b;
    }
    color+=vec3(0.36,0.63,0.85)*min(palmArc,1.4)*(0.22+0.78*discharge);
    float palm=oval(p,vec2(0.492,0.519),vec2(0.087,0.028));
    color+=vec3(0.12,0.29,0.36)*palm*(0.35+discharge);
    float gem=oval(p,vec2(0.714,0.180),vec2(0.012,0.010));
    color+=vec3(0.12,0.70,0.88)*gem*(0.6+0.4*beat);

    // The original orange roots feed sparks toward her charged hand.
    float flames=oval(p,vec2(0.305,0.503),vec2(0.265,0.105));
    float orange=smoothstep(0.10,0.37,scan.r-scan.b);
    color+=vec3(0.30,0.075,0.006)*flames*orange
           *(0.55+0.25*sin(t*4.4-p.y*79.0)+0.20*sin(t*7.0+p.x*54.0));
    for (int i=0;i<12;i++) {
        float fi=float(i);
        float f=fract(t*(0.13+0.04*hash(fi))+hash(fi+seed*17.0));
        vec2 start=vec2(0.12+hash(fi+8.0)*0.27,0.55);
        vec2 c=mix(start,vec2(0.475,0.512),f);
        c.y-=sin(f*3.141593)*(0.035+0.075*hash(fi+23.0));
        float d=length((p-c)*vec2(1.0,1.4));
        float spark=(1.0-smoothstep(0.0015,0.0027+aa*0.5,d))*sin(f*3.141593);
        color+=vec3(0.82,0.32,0.025)*spark;
    }

    if (u_is_foil) {
        // Gold crown, jewel chain, purple silk and fire carry a broad embossed
        // spectrum; the face remains natural. Visible also with time frozen.
        float luma=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
        float metal=smoothstep(0.18,0.61,luma);
        float robe=oval(p,vec2(0.691,0.410),vec2(0.165,0.130));
        float phase=p.x*2.0-p.y*3.0+t*0.13+seed+0.08*sin(p.y*34.0+p.x*14.0);
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        vec3 foil=mix(2.0*color*spectrum,
                      1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        float amount=(0.24+0.30*metal+0.16*robe)*(1.0-face*0.93);
        color=mix(color,foil,amount);
        float gleam=pow(0.5+0.5*sin(p.x*13.0-p.y*19.0+t*1.2+seed*4.0),12.0);
        color+=(1.0-color)*mix(vec3(1.0,0.76,0.34),spectrum,0.48)
               *gleam*(0.13+0.42*metal+0.15*robe)*(1.0-face);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
