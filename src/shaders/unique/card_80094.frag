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

// Крысполин: the many-headed giant drives his uprooted branch sideways.
// Broad, interrupted pressure wakes and tumbling torn leaves convey the
// crushing attack that exhausts its target; tiny heads answer in sequence.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.48,1.0,length((p-c)/r));
}
float hash(float v) { return fract(sin(v*127.1+17.7)*43758.5453); }
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=1.0/max(u_resolution.x,1.0);
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173)*6.2831853;
    // Class line ends above .14; the first ropes begin below .55.
    float art=smoothstep(0.140,0.157,p.y)*(1.0-smoothstep(0.530,0.549,p.y));
    art*=smoothstep(0.018,0.036,p.x)*(1.0-smoothstep(0.963,0.981,p.x));
    art*=smoothstep(1.0,1.16,length((p-vec2(0.108,0.182))/vec2(0.064,0.044)));
    vec3 color=scan.rgb;
    float charge=sin(t*2.4+seed);
    float body=oval(p,vec2(0.49,0.348),vec2(0.34,0.168));
    // A restrained heave of the body/branch is confined well inside the art.
    vec2 shift=vec2(0.0035*sin(t*2.4+seed),0.0022*charge)*body*art;
    vec3 moving=texture2D(u_card,vec2(p.x+shift.x,1.0-p.y-shift.y)).rgb;
    color=mix(color,moving,body*art);

    // Three separated, accelerating wakes hug the lower edge of the real
    // horizontal branch. Their moving leading tips remain visible at 128px.
    float wakes=0.0;
    float haze=0.0;
    for(int i=0;i<3;i++) {
        float k=float(i);
        float f=fract(t*0.47+k*0.31+seed*0.05);
        float x=0.12+0.79*f;
        float curve=0.422+k*0.024-0.042*sin(p.x*3.14159265);
        curve+=0.007*sin(p.x*9.0-t*3.2+k);
        float ydist=abs(p.y-curve);
        float tail=smoothstep(x-0.22,x-0.11,p.x)*(1.0-smoothstep(x-0.008,x+0.022,p.x));
        float fade=smoothstep(0.0,0.12,f)*(1.0-smoothstep(0.82,1.0,f));
        wakes+=(1.0-smoothstep(0.0013,0.0030+aa*0.65,ydist))*tail*fade;
        haze+=exp(-ydist*86.0)*tail*fade;
    }
    color+=vec3(0.29,0.21,0.065)*wakes+vec3(0.062,0.055,0.020)*haze;

    // Torn leaf silhouettes move fast enough to read as physical debris,
    // with warm edges and a dark center instead of floating white dots.
    for(int i=0;i<13;i++) {
        float k=float(i);
        float h=hash(k+seed);
        float f=fract(t*(0.27+0.13*h)+k*0.618034+seed*0.03);
        vec2 c=vec2(0.07+0.87*f,0.385+0.112*hash(k+31.0));
        c.y-=0.040*sin(f*3.14159265);
        c.y+=0.012*sin(f*9.0+k*2.0);
        float angle=t*(2.0+2.0*h)+k*2.4;
        vec2 q=(p-c)*vec2(1.0,1.4113);
        q=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*q;
        float size=0.008+0.006*h;
        float d=abs(q.x)/size+abs(q.y)/(size*0.42);
        float leaf=1.0-smoothstep(0.65,1.0+aa/size*0.5,d);
        float fade=smoothstep(0.0,0.09,f)*(1.0-smoothstep(0.87,1.0,f));
        vec3 ink=mix(vec3(0.16,0.20,0.035),vec3(0.62,0.39,0.08),h);
        color=mix(color,ink,leaf*fade*0.86);
        float vein=(1.0-smoothstep(0.0005,0.0012+aa*0.3,abs(q.y)))*leaf;
        color+=vec3(0.20,0.16,0.035)*vein*fade;
    }
    // The snarling painted heads answer the giant's effort in a wave.
    float heads=0.0;
    for(int i=0;i<4;i++) {
        float k=float(i);
        vec2 c=vec2(0.441,0.264);
        if(i==1) c=vec2(0.552,0.291);
        if(i==2) c=vec2(0.644,0.329);
        if(i==3) c=vec2(0.676,0.236);
        float pulse=pow(0.5+0.5*sin(t*2.4-k*0.75+seed),4.0);
        heads+=oval(p,c,vec2(0.036,0.021))*pulse;
    }
    color+=vec3(0.13,0.043,0.008)*heads;

    if(u_is_foil) {
        // Copper fur and emerald foliage form a saturated metallic substrate.
        // Its broad hue fields are present even in the static t=0 preview.
        float phase=p.x*1.55+p.y*1.2-t*0.15+seed*0.04;
        vec3 hue=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        vec3 overlay=mix(2.0*color*hue,1.0-2.0*(1.0-color)*(1.0-hue),step(vec3(0.5),color));
        color=mix(color,overlay,0.38);
        float fur=body*smoothstep(0.025,0.21,scan.r-scan.b);
        float glint=pow(0.5+0.5*sin(p.x*22.0+p.y*17.0-t*2.1+seed),10.0);
        color+=(1.0-color)*mix(vec3(0.72,0.38,0.10),hue,0.48)*fur*(0.12+0.48*glint);
        color+=hue*wakes*0.20;
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
